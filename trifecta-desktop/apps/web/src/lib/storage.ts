import { Debouncer } from "@tanstack/react-pacer";

export interface StateStorage<R = unknown> {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => R;
  removeItem: (name: string) => R;
}

export interface DebouncedStorage<R = unknown> extends StateStorage<R> {
  flush: () => void;
}

export function createMemoryStorage(): StateStorage {
  const store = new Map<string, string>();
  return {
    getItem: (name) => store.get(name) ?? null,
    setItem: (name, value) => {
      store.set(name, value);
    },
    removeItem: (name) => {
      store.delete(name);
    },
  };
}

export function isStateStorage(
  storage: Partial<StateStorage> | null | undefined,
): storage is StateStorage {
  return (
    storage !== null &&
    storage !== undefined &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
  );
}

export function resolveStorage(storage: Partial<StateStorage> | null | undefined): StateStorage {
  return isStateStorage(storage) ? storage : createMemoryStorage();
}

export function createDebouncedStorage(
  baseStorage: Partial<StateStorage> | null | undefined,
  debounceMs: number = 300,
): DebouncedStorage {
  const resolvedStorage = resolveStorage(baseStorage);
  const debouncedSetItem = new Debouncer(
    (name: string, value: string) => {
      resolvedStorage.setItem(name, value);
    },
    { wait: debounceMs },
  );

  return {
    getItem: (name) => resolvedStorage.getItem(name),
    setItem: (name, value) => {
      debouncedSetItem.maybeExecute(name, value);
    },
    removeItem: (name) => {
      debouncedSetItem.cancel();
      resolvedStorage.removeItem(name);
    },
    flush: () => {
      debouncedSetItem.flush();
    },
  };
}

const STORAGE_KEY_PREFIX_MIGRATIONS: ReadonlyArray<{
  readonly from: string;
  readonly to: string;
}> = [
  { from: "trifecta:", to: "belweave:" },
  { from: "codething:", to: "belweave:" },
];

const STORAGE_PREFIX_MIGRATION_KEY = "belweave:storage-prefix-migration:v1";

export function migrateStorageKeyPrefixes(): void {
  if (typeof window === "undefined") return;

  try {
    const done = window.localStorage.getItem(STORAGE_PREFIX_MIGRATION_KEY);
    if (done === "1") return;

    let migrated = false;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key === null) continue;

      for (const migration of STORAGE_KEY_PREFIX_MIGRATIONS) {
        if (!key.startsWith(migration.from)) continue;

        const newKey = migration.to + key.slice(migration.from.length);
        if (!window.localStorage.getItem(newKey)) {
          window.localStorage.setItem(newKey, window.localStorage.getItem(key) ?? "");
        }
        window.localStorage.removeItem(key);
        migrated = true;
        i--;
        break;
      }
    }

    if (migrated || !done) {
      window.localStorage.setItem(STORAGE_PREFIX_MIGRATION_KEY, "1");
    }
  } catch {
    // Ignore storage errors — not critical if migration fails.
  }
}
