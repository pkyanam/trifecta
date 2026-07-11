import React, { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { Uniwind } from "uniwind";
import * as SecureStore from "expo-secure-store";

const PREFERENCES_KEY = "trifecta.mobile.preferences.v1";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedColorScheme = "light" | "dark";

type PreferencesContextValue = {
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => void;
  resolvedColorScheme: ResolvedColorScheme;
  hapticsEnabled: boolean;
  setHapticsEnabled: (value: boolean) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themePreferenceValue, setThemePreferenceValue] = useState<ThemePreference>("system");
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(PREFERENCES_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const value = JSON.parse(raw) as { theme?: ThemePreference; haptics?: boolean };
        if (value.theme === "system" || value.theme === "light" || value.theme === "dark") {
          setThemePreferenceValue(value.theme);
          Uniwind.setTheme(value.theme);
        }
        if (typeof value.haptics === "boolean") setHapticsEnabled(value.haptics);
      } catch {}
    }).finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    void SecureStore.setItemAsync(
      PREFERENCES_KEY,
      JSON.stringify({ theme: themePreferenceValue, haptics: hapticsEnabled }),
    );
  }, [hapticsEnabled, hydrated, themePreferenceValue]);
  const resolvedSystemColorScheme: ResolvedColorScheme =
    systemColorScheme === "dark" ? "dark" : "light";

  const resolvedColorScheme: ResolvedColorScheme =
    themePreferenceValue === "system" ? resolvedSystemColorScheme : themePreferenceValue;

  const setThemePreference = useCallback((value: ThemePreference) => {
    setThemePreferenceValue(value);
    Uniwind.setTheme(value);
  }, []);

  const setPersistedHapticsEnabled = useCallback((value: boolean) => {
    setHapticsEnabled(value);
  }, []);

  const value = useMemo(
    () => ({
      themePreference: themePreferenceValue,
      setThemePreference,
      resolvedColorScheme,
      hapticsEnabled,
      setHapticsEnabled: setPersistedHapticsEnabled,
    }),
    [hapticsEnabled, resolvedColorScheme, setPersistedHapticsEnabled, setThemePreference, themePreferenceValue],
  );

  return (
    <PreferencesContext value={value}>
      {children}
    </PreferencesContext>
  );
}

export function usePreferences() {
  const context = use(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used within a PreferencesProvider");
  return context;
}
