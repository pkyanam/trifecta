/**
 * AcpRegistryTextGeneration — text generation via a one-shot ACP Registry agent session.
 *
 * Each generation call spawns a fresh agent subprocess using the configured
 * command + args, sends a single prompt, collects the full `agent_message_chunk`
 * stream, then closes the process. No wire normalization is applied.
 *
 * @module textGeneration/AcpRegistryTextGeneration
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { AcpRegistrySettings } from "@belweave/contracts";
import { TextGenerationError } from "@belweave/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@belweave/shared/git";

import * as AcpClient from "effect-acp/client";

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

const ACP_REGISTRY_TEXT_GEN_TIMEOUT_MS = 120_000;

function parseCommandArgs(commandArgs: string): string[] {
  return commandArgs ? commandArgs.split(/\s+/).filter(Boolean) : [];
}

const runAcpRegistryPrompt = Effect.fn("runAcpRegistryPrompt")(function* (
  spawnCommand: string,
  spawnArgs: string[],
  cwd: string,
  promptText: string,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<string, TextGenerationError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const scope = yield* Scope.make("sequential");

  const result = yield* Effect.gen(function* () {
    const command = ChildProcess.make(spawnCommand, spawnArgs, {
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
              detail: `Failed to spawn ${spawnCommand}: ${err.message}`,
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
            detail: "Failed to build ACP client.",
          }),
      ),
    );
    const acp = Context.get(acpContext, AcpClient.AcpClient);

    yield* acp.agent
      .initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "trifecta-desktop", version: "1.0.0" },
      })
      .pipe(
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `ACP initialize failed: ${String(err)}`,
            }),
        ),
      );

    const sessionResult = yield* acp.agent
      .createSession({ cwd, mcpServers: [] })
      .pipe(
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `ACP session/new failed: ${String(err)}`,
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
        sessionId: sessionResult.sessionId,
        prompt: [{ type: "text", text: promptText }],
      })
      .pipe(
        Effect.mapError(
          (err) =>
            new TextGenerationError({
              operation: "generateText",
              detail: `ACP prompt failed: ${String(err)}`,
            }),
        ),
      );

    return collected;
  }).pipe(
    Effect.ensuring(Scope.close(scope, Exit.void)),
    Effect.timeout(ACP_REGISTRY_TEXT_GEN_TIMEOUT_MS),
    Effect.mapError((err) =>
      err._tag === "TimeoutError"
        ? new TextGenerationError({
            operation: "generateText",
            detail: "ACP Registry text generation timed out.",
          })
        : (err as TextGenerationError),
    ),
  );

  return result;
});

const runAcpRegistryJsonPrompt = Effect.fn("runAcpRegistryJsonPrompt")(function* <
  S extends Schema.Top,
>(
  spawnCommand: string,
  spawnArgs: string[],
  cwd: string,
  promptText: string,
  outputSchema: S,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<
  S["Type"],
  TextGenerationError,
  ChildProcessSpawner.ChildProcessSpawner | S["DecodingServices"]
> {
  const raw = yield* runAcpRegistryPrompt(spawnCommand, spawnArgs, cwd, promptText, environment);
  const trimmed = raw.trim();

  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, trimmed];
  const jsonText = jsonMatch[1]?.trim() ?? trimmed;

  return yield* Schema.decodeEffect(Schema.fromJsonString(outputSchema))(jsonText).pipe(
    Effect.mapError(
      () =>
        new TextGenerationError({
          operation: "generateText",
          detail: "ACP Registry agent returned invalid structured output.",
        }),
    ),
  );
});

export const makeAcpRegistryTextGeneration = Effect.fn("makeAcpRegistryTextGeneration")(
  function* (
    config: AcpRegistrySettings,
    environment?: NodeJS.ProcessEnv,
  ): Effect.fn.Return<TextGenerationShape, never, ChildProcessSpawner.ChildProcessSpawner> {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const spawnCommand = config.command || "npx";
    const spawnArgs = parseCommandArgs(config.commandArgs);
    const env = environment ?? process.env;

    const runJson = <S extends Schema.Top>(cwd: string, promptText: string, outputSchema: S) =>
      runAcpRegistryJsonPrompt(spawnCommand, spawnArgs, cwd, promptText, outputSchema, env).pipe(
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
          const result: BranchNameGenerationResult = { branch: branch || "feature/acp-branch" };
          return result;
        }),

      generateThreadTitle: (input: ThreadTitleGenerationInput) =>
        Effect.gen(function* () {
          const { prompt, outputSchema } = buildThreadTitlePrompt({ message: input.message });
          const generated = yield* runJson(input.cwd, prompt, outputSchema);
          const title = sanitizeThreadTitle(generated.title.trim().split("\n")[0] ?? "");
          const result: ThreadTitleGenerationResult = { title: title || "ACP session" };
          return result;
        }),
    } satisfies TextGenerationShape;
  },
);
