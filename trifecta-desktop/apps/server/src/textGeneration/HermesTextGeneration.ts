/**
 * HermesTextGeneration — text generation via a one-shot Hermes ACP session.
 *
 * Each generation call spawns a fresh `hermes acp` subprocess, sends a single
 * prompt, collects the full `agent_message_chunk` stream, then closes the
 * process. The subprocess lifetime is scoped to each operation.
 *
 * @module textGeneration/HermesTextGeneration
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { HermesSettings } from "@belweave/contracts";
import { TextGenerationError } from "@belweave/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@belweave/shared/git";

import * as AcpClient from "effect-acp/client";
import { AGENT_METHODS } from "effect-acp/schema";

import {
  decodeHermesInitializeResponse,
  decodeHermesNewSessionResponse,
} from "../provider/hermes/HermesAcpWire.ts";
import type { TextGenerationShape } from "./TextGeneration.ts";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import { sanitizeCommitSubject, sanitizePrTitle, sanitizeThreadTitle } from "./TextGenerationUtils.ts";
import type {
  BranchNameGenerationInput,
  BranchNameGenerationResult,
  CommitMessageGenerationInput,
  CommitMessageGenerationResult,
  PrContentGenerationInput,
  PrContentGenerationResult,
  ThreadTitleGenerationInput,
  ThreadTitleGenerationResult,
} from "./TextGeneration.ts";

const HERMES_TEXT_GEN_TIMEOUT_MS = 120_000;

const runHermesPrompt = Effect.fn("runHermesPrompt")(function* (
  binaryPath: string,
  cwd: string,
  promptText: string,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<string, TextGenerationError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const scope = yield* Scope.make("sequential");

  const result = yield* Effect.gen(function* () {
    const command = ChildProcess.make(binaryPath || "hermes", ["acp"], {
      cwd,
      env: environment ?? process.env,
      shell: process.platform === "win32",
    });

    const handle = yield* spawner
      .spawn(command)
      .pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `Failed to spawn hermes acp: ${err.message}`,
            }),
        ),
      );

    const acpLayer = AcpClient.layerChildProcess(handle);
    const acpContext = yield* Layer.build(acpLayer).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.mapError(
        () =>
          new TextGenerationError({
            operation: "generateText",
            detail: "Failed to build Hermes ACP client.",
          }),
      ),
    );
    const acp = Context.get(acpContext, AcpClient.AcpClient);

    const rawInit = yield* acp.raw.request(AGENT_METHODS.initialize, {
      protocolVersion: 1 as const,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "trifecta-desktop", version: "1.0.0" },
    }).pipe(
      Effect.mapError(
        (err) =>
          new TextGenerationError({
            operation: "generateText",
            detail: `ACP initialize transport failed: ${String(err)}`,
          }),
      ),
    );

    yield* decodeHermesInitializeResponse(rawInit).pipe(
      Effect.mapError(
        (err) =>
          new TextGenerationError({
            operation: "generateText",
            detail: `ACP initialize response decode failed: ${err.message}`,
          }),
      ),
    );

    const rawSession = yield* acp.raw
      .request(AGENT_METHODS.session_new, { cwd, mcpServers: [] })
      .pipe(
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `ACP session/new transport failed: ${String(err)}`,
            }),
        ),
      );

    const session = yield* decodeHermesNewSessionResponse(rawSession).pipe(
      Effect.mapError(
        (err) =>
          new TextGenerationError({
            operation: "generateText",
            detail: `ACP session/new response decode failed: ${err.message}`,
          }),
      ),
    );

    let collected = "";
    yield* acp.handleSessionUpdate((notification) =>
      Effect.suspend(() => {
        const update = notification.update;
        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text" &&
          update.content.text
        ) {
          collected += update.content.text;
        }
        return Effect.void;
      }),
    );

    yield* acp.agent
      .prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: promptText }],
      })
      .pipe(
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `Hermes ACP prompt failed: ${String(err)}`,
            }),
        ),
      );

    return collected;
  }).pipe(
    Effect.ensuring(Scope.close(scope, Exit.void)),
    Effect.timeout(HERMES_TEXT_GEN_TIMEOUT_MS),
    Effect.mapError((err) =>
      err._tag === "TimeoutError"
        ? new TextGenerationError({
            operation: "generateText",
            detail: "Hermes text generation timed out.",
          })
        : (err as TextGenerationError),
    ),
  );

  return result;
});

const runHermesJsonPrompt = Effect.fn("runHermesJsonPrompt")(function* <S extends Schema.Top>(
  binaryPath: string,
  cwd: string,
  promptText: string,
  outputSchema: S,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<S["Type"], TextGenerationError, ChildProcessSpawner.ChildProcessSpawner | S["DecodingServices"]> {
  const raw = yield* runHermesPrompt(binaryPath, cwd, promptText, environment);
  const trimmed = raw.trim();

  // Extract JSON from the response (model may wrap it in markdown code fences)
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, trimmed];
  const jsonText = jsonMatch[1]?.trim() ?? trimmed;

  return yield* Schema.decodeEffect(Schema.fromJsonString(outputSchema))(jsonText).pipe(
    Effect.mapError(
      () =>
        new TextGenerationError({
          operation: "generateText",
          detail: "Hermes returned invalid structured output.",
        }),
    ),
  );
});

export const makeHermesTextGeneration = Effect.fn("makeHermesTextGeneration")(function* (
  hermesConfig: HermesSettings,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<TextGenerationShape, never, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const binaryPath = hermesConfig.binaryPath || "hermes";
  const env = environment ?? process.env;

  const runJson = <S extends Schema.Top>(
    cwd: string,
    promptText: string,
    outputSchema: S,
  ) =>
    runHermesJsonPrompt(binaryPath, cwd, promptText, outputSchema, env).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

  return {
    generateCommitMessage: (input: CommitMessageGenerationInput) =>
      Effect.gen(function* () {
        const { prompt, outputSchema } = buildCommitMessagePrompt({
          branch: input.branch,
          stagedSummary: input.stagedSummary,
          stagedPatch: input.stagedPatch,
          includeBranch: input.includeBranch ?? false,
        });
        const generated = yield* runJson(input.cwd, prompt, outputSchema);
        const result: CommitMessageGenerationResult = {
          subject: sanitizeCommitSubject(generated.subject),
          body: generated.body.trim(),
          ...("branch" in generated && typeof generated.branch === "string"
            ? { branch: sanitizeFeatureBranchName(generated.branch) }
            : {}),
        };
        return result;
      }),

    generatePrContent: (input: PrContentGenerationInput) =>
      Effect.gen(function* () {
        const { prompt, outputSchema } = buildPrContentPrompt({
          baseBranch: input.baseBranch,
          headBranch: input.headBranch,
          commitSummary: input.commitSummary,
          diffSummary: input.diffSummary,
          diffPatch: input.diffPatch,
        });
        const generated = yield* runJson(input.cwd, prompt, outputSchema);
        const result: PrContentGenerationResult = {
          title: sanitizePrTitle(generated.title),
          body: generated.body.trim(),
        };
        return result;
      }),

    generateBranchName: (input: BranchNameGenerationInput) =>
      Effect.gen(function* () {
        const { prompt, outputSchema } = buildBranchNamePrompt({ message: input.message });
        const generated = yield* runJson(input.cwd, prompt, outputSchema);
        const branch = sanitizeFeatureBranchName(
          sanitizeBranchFragment(generated.branch.trim().split("\n")[0] ?? ""),
        );
        const result: BranchNameGenerationResult = { branch: branch || "feature/hermes-branch" };
        return result;
      }),

    generateThreadTitle: (input: ThreadTitleGenerationInput) =>
      Effect.gen(function* () {
        const { prompt, outputSchema } = buildThreadTitlePrompt({ message: input.message });
        const generated = yield* runJson(input.cwd, prompt, outputSchema);
        const title = sanitizeThreadTitle(generated.title.trim().split("\n")[0] ?? "");
        const result: ThreadTitleGenerationResult = { title: title || "Hermes session" };
        return result;
      }),
  } satisfies TextGenerationShape;
});
