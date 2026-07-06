import {
  BelweaveCloudConnectedSandboxSchema,
  DEFAULT_BELWEAVE_CLOUD_CONFIG,
  type BelweaveCloudConfig,
} from "@belweave/contracts";
import { fromLenientJson } from "@belweave/shared/schemaJson";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";
import * as Ref from "effect/Ref";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";

interface BelweaveCloudDocument {
  readonly version: number;
  readonly apiBaseUrl: string | null;
  readonly connectedSandboxes: BelweaveCloudConfig["connectedSandboxes"];
  readonly encryptedApiKey?: string;
}

const BelweaveCloudStorageDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.Number),
  apiBaseUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
  connectedSandboxes: Schema.optionalKey(Schema.Array(BelweaveCloudConnectedSandboxSchema)),
  encryptedApiKey: Schema.optionalKey(Schema.String),
});

const BelweaveCloudDocumentJson = fromLenientJson(BelweaveCloudStorageDocumentSchema);
const decodeBelweaveCloudDocumentJson = Schema.decodeEffect(BelweaveCloudDocumentJson);
const encodeBelweaveCloudDocumentJson = Schema.encodeEffect(BelweaveCloudDocumentJson);

export class DesktopBelweaveCloudWriteError extends Data.TaggedError(
  "DesktopBelweaveCloudWriteError",
)<{
  readonly cause: PlatformError.PlatformError | Schema.SchemaError;
}> {
  override get message() {
    return `Failed to write desktop Belweave Cloud config: ${this.cause.message}`;
  }
}

export class DesktopBelweaveCloudSecretDecodeError extends Data.TaggedError(
  "DesktopBelweaveCloudSecretDecodeError",
)<{
  readonly cause: Encoding.EncodingError;
}> {
  override get message() {
    return "Failed to decode desktop Belweave Cloud API key.";
  }
}

export type DesktopBelweaveCloudGetApiKeyError =
  | DesktopBelweaveCloudSecretDecodeError
  | ElectronSafeStorage.ElectronSafeStorageAvailabilityError
  | ElectronSafeStorage.ElectronSafeStorageDecryptError;

export type DesktopBelweaveCloudSetApiKeyError =
  | DesktopBelweaveCloudWriteError
  | ElectronSafeStorage.ElectronSafeStorageAvailabilityError
  | ElectronSafeStorage.ElectronSafeStorageEncryptError;

export interface DesktopBelweaveCloudShape {
  readonly getConfig: Effect.Effect<BelweaveCloudConfig>;
  readonly setConfig: (
    config: BelweaveCloudConfig,
  ) => Effect.Effect<void, DesktopBelweaveCloudWriteError>;
  readonly getApiKey: Effect.Effect<Option.Option<string>, DesktopBelweaveCloudGetApiKeyError>;
  readonly setApiKey: (
    apiKey: string,
  ) => Effect.Effect<boolean, DesktopBelweaveCloudSetApiKeyError>;
  readonly removeApiKey: Effect.Effect<void, DesktopBelweaveCloudWriteError>;
}

export class DesktopBelweaveCloud extends Context.Service<
  DesktopBelweaveCloud,
  DesktopBelweaveCloudShape
>()("belweave/desktop/BelweaveCloud") {}

function normalizeDocument(
  document: typeof BelweaveCloudStorageDocumentSchema.Type,
): BelweaveCloudDocument {
  return {
    version: document.version ?? 1,
    apiBaseUrl: document.apiBaseUrl ?? null,
    connectedSandboxes: document.connectedSandboxes ?? [],
    ...(document.encryptedApiKey ? { encryptedApiKey: document.encryptedApiKey } : {}),
  };
}

function toConfig(document: BelweaveCloudDocument): BelweaveCloudConfig {
  return {
    apiBaseUrl: document.apiBaseUrl,
    connectedSandboxes: document.connectedSandboxes,
  };
}

function readDocument(
  fileSystem: FileSystem.FileSystem,
  configPath: string,
): Effect.Effect<BelweaveCloudDocument> {
  return fileSystem.readFileString(configPath).pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(normalizeDocument({})),
        onSome: (raw) =>
          decodeBelweaveCloudDocumentJson(raw).pipe(
            Effect.map(normalizeDocument),
            Effect.catch(() => Effect.succeed(normalizeDocument({}))),
          ),
      }),
    ),
  );
}

const writeDocumentFile = Effect.fn("desktop.belweaveCloud.writeDocument")(function* (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly configPath: string;
  readonly document: BelweaveCloudDocument;
}): Effect.fn.Return<void, PlatformError.PlatformError | Schema.SchemaError> {
  const directory = input.path.dirname(input.configPath);
  const suffix = (yield* Random.nextUUIDv4).replace(/-/g, "");
  const tempPath = `${input.configPath}.${process.pid}.${suffix}.tmp`;
  const encoded = yield* encodeBelweaveCloudDocumentJson(input.document);
  yield* input.fileSystem.makeDirectory(directory, { recursive: true });
  yield* input.fileSystem.writeFileString(tempPath, `${encoded}\n`);
  yield* input.fileSystem.rename(tempPath, input.configPath);
});

function decodeSecretBytes(
  encoded: string,
): Effect.Effect<Uint8Array, DesktopBelweaveCloudSecretDecodeError> {
  return Effect.fromResult(Encoding.decodeBase64(encoded)).pipe(
    Effect.mapError((cause) => new DesktopBelweaveCloudSecretDecodeError({ cause })),
  );
}

export const layer = Layer.effect(
  DesktopBelweaveCloud,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;

    const writeDocument = (document: BelweaveCloudDocument) =>
      writeDocumentFile({
        fileSystem,
        path,
        configPath: environment.belweaveCloudConfigPath,
        document,
      }).pipe(Effect.mapError((cause) => new DesktopBelweaveCloudWriteError({ cause })));

    return DesktopBelweaveCloud.of({
      getConfig: readDocument(fileSystem, environment.belweaveCloudConfigPath).pipe(
        Effect.map(toConfig),
        Effect.withSpan("desktop.belweaveCloud.getConfig"),
      ),
      setConfig: Effect.fn("desktop.belweaveCloud.setConfig")(function* (config) {
        const document = yield* readDocument(fileSystem, environment.belweaveCloudConfigPath);
        yield* writeDocument({
          version: document.version,
          apiBaseUrl: config.apiBaseUrl,
          connectedSandboxes: config.connectedSandboxes,
          ...(document.encryptedApiKey ? { encryptedApiKey: document.encryptedApiKey } : {}),
        });
      }),
      getApiKey: Effect.gen(function* () {
        const document = yield* readDocument(fileSystem, environment.belweaveCloudConfigPath);
        const encoded = Option.fromNullishOr(document.encryptedApiKey);
        if (Option.isNone(encoded) || !(yield* safeStorage.isEncryptionAvailable)) {
          return Option.none<string>();
        }
        const secretBytes = yield* decodeSecretBytes(encoded.value);
        return Option.some(yield* safeStorage.decryptString(secretBytes));
      }).pipe(Effect.withSpan("desktop.belweaveCloud.getApiKey")),
      setApiKey: Effect.fn("desktop.belweaveCloud.setApiKey")(function* (apiKey) {
        const document = yield* readDocument(fileSystem, environment.belweaveCloudConfigPath);
        if (!(yield* safeStorage.isEncryptionAvailable)) {
          return false;
        }
        const encryptedApiKey = Encoding.encodeBase64(yield* safeStorage.encryptString(apiKey));
        yield* writeDocument({ ...document, encryptedApiKey });
        return true;
      }),
      removeApiKey: Effect.gen(function* () {
        const document = yield* readDocument(fileSystem, environment.belweaveCloudConfigPath);
        if (document.encryptedApiKey === undefined) {
          return;
        }
        yield* writeDocument({
          version: document.version,
          apiBaseUrl: document.apiBaseUrl,
          connectedSandboxes: document.connectedSandboxes,
        });
      }).pipe(Effect.withSpan("desktop.belweaveCloud.removeApiKey")),
    });
  }),
);

export const layerTest = (input?: {
  readonly config?: BelweaveCloudConfig;
  readonly apiKey?: string;
}) =>
  Layer.effect(
    DesktopBelweaveCloud,
    Effect.gen(function* () {
      const configRef = yield* Ref.make(input?.config ?? DEFAULT_BELWEAVE_CLOUD_CONFIG);
      const apiKeyRef = yield* Ref.make(Option.fromNullishOr(input?.apiKey));

      return DesktopBelweaveCloud.of({
        getConfig: Ref.get(configRef),
        setConfig: (config) => Ref.set(configRef, config),
        getApiKey: Ref.get(apiKeyRef),
        setApiKey: (apiKey) => Ref.set(apiKeyRef, Option.some(apiKey)).pipe(Effect.as(true)),
        removeApiKey: Ref.set(apiKeyRef, Option.none()),
      });
    }),
  );
