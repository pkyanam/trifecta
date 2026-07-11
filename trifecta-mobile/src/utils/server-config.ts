import type {
  ServerConfig,
  ServerProvider,
  ServerProviderModel,
} from "@/types/thread";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeModel(value: unknown): ServerProviderModel | null {
  if (!isRecord(value)) return null;
  const slug = optionalString(value.slug);
  const name = optionalString(value.name);
  if (!slug || !name) return null;

  return {
    slug,
    name,
    shortName: optionalString(value.shortName),
    subProvider: optionalString(value.subProvider),
    isCustom: value.isCustom === true,
    capabilities: isRecord(value.capabilities) ? value.capabilities : null,
    // Older servers exposed this flag. Keep accepting it so a newer mobile
    // build remains compatible with servers from before the model contract
    // moved eligibility to provider readiness.
    eligible: typeof value.eligible === "boolean" ? value.eligible : undefined,
  };
}

function normalizeProvider(value: unknown): ServerProvider | null {
  if (!isRecord(value)) return null;
  const instanceId = optionalString(value.instanceId);
  const driver = optionalString(value.driver);
  if (!instanceId || !driver) return null;

  const models = Array.isArray(value.models)
    ? value.models.map(normalizeModel).filter((model) => model !== null)
    : [];
  const slashCommands = Array.isArray(value.slashCommands)
    ? value.slashCommands.flatMap((command) => {
        if (!isRecord(command)) return [];
        const name = optionalString(command.name);
        if (!name) return [];
        const input = isRecord(command.input)
          ? { hint: optionalString(command.input.hint) }
          : undefined;
        return [{
          name,
          description: optionalString(command.description),
          ...(input?.hint ? { input: { hint: input.hint } } : {}),
        }];
      })
    : [];
  const skills = Array.isArray(value.skills)
    ? value.skills.flatMap((skill) => {
        if (!isRecord(skill)) return [];
        const name = optionalString(skill.name);
        if (!name) return [];
        return [{
          name,
          description: optionalString(skill.description),
          shortDescription: optionalString(skill.shortDescription),
        }];
      })
    : [];

  return {
    instanceId,
    driver,
    displayName: optionalString(value.displayName),
    label: optionalString(value.label),
    accentColor: optionalString(value.accentColor),
    enabled: value.enabled === true,
    installed: value.installed === true,
    status: optionalString(value.status),
    availability: optionalString(value.availability),
    models,
    slashCommands,
    skills,
  };
}

export function normalizeServerConfig(value: unknown): ServerConfig | null {
  if (!isRecord(value)) return null;
  const cwd = typeof value.cwd === "string" ? value.cwd : "";
  const providers = Array.isArray(value.providers)
    ? value.providers.map(normalizeProvider).filter((provider) => provider !== null)
    : [];

  return {
    cwd,
    projectName:
      optionalString(value.projectName) ??
      cwd.split("/").filter(Boolean).pop() ??
      "Trifecta Server",
    providers,
  };
}

/**
 * Reduce the versioned `subscribeServerConfig` stream used by current desktop
 * and headless servers. A raw config is also accepted for compatibility with
 * older server builds that streamed snapshots without an event envelope.
 */
export function applyServerConfigStreamValue(
  current: ServerConfig | null,
  value: unknown,
): ServerConfig | null {
  if (!isRecord(value)) return current;

  if (value.type === "snapshot") {
    return normalizeServerConfig(value.config) ?? current;
  }

  if (value.type === "providerStatuses") {
    const payload = isRecord(value.payload) ? value.payload : null;
    if (!current || !payload || !Array.isArray(payload.providers)) return current;
    const providers = payload.providers
      .map(normalizeProvider)
      .filter((provider) => provider !== null);
    return { ...current, providers };
  }

  // Settings and keybinding events do not alter the subset of server config
  // consumed by mobile.
  if (value.type === "settingsUpdated" || value.type === "keybindingsUpdated") {
    return current;
  }

  return normalizeServerConfig(value) ?? current;
}
