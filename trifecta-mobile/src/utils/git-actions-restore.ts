import * as SecureStore from "expo-secure-store";

const GIT_ACTIONS_RESTORE_KEY = "trifecta.gitActions.restore";
const RESTORE_TTL_MS = 15_000;

type GitActionsRestoreState = {
  cwd: string;
  expiresAt: number;
};

export function markGitActionsRestore(cwd: string) {
  if (!cwd) return;
  const state: GitActionsRestoreState = {
    cwd,
    expiresAt: Date.now() + RESTORE_TTL_MS,
  };
  void SecureStore.setItemAsync(
    GIT_ACTIONS_RESTORE_KEY,
    JSON.stringify(state),
  ).catch(() => {});
}

export function clearGitActionsRestore() {
  void SecureStore.deleteItemAsync(GIT_ACTIONS_RESTORE_KEY).catch(() => {});
}

export async function shouldRestoreGitActions(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  try {
    const raw = await SecureStore.getItemAsync(GIT_ACTIONS_RESTORE_KEY);
    if (!raw) return false;

    await SecureStore.deleteItemAsync(GIT_ACTIONS_RESTORE_KEY);
    const state = JSON.parse(raw) as Partial<GitActionsRestoreState>;
    return state.cwd === cwd && (state.expiresAt ?? 0) > Date.now();
  } catch {
    return false;
  }
}
