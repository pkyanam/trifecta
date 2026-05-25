import React, { createContext, use, useCallback, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { Uniwind } from "uniwind";

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
  const resolvedSystemColorScheme: ResolvedColorScheme =
    systemColorScheme === "dark" ? "dark" : "light";

  const resolvedColorScheme: ResolvedColorScheme =
    themePreferenceValue === "system" ? resolvedSystemColorScheme : themePreferenceValue;

  const setThemePreference = useCallback((value: ThemePreference) => {
    setThemePreferenceValue(value);
    Uniwind.setTheme(value);
  }, []);

  const value = useMemo(
    () => ({
      themePreference: themePreferenceValue,
      setThemePreference,
      resolvedColorScheme,
      hapticsEnabled,
      setHapticsEnabled,
    }),
    [hapticsEnabled, resolvedColorScheme, setThemePreference, themePreferenceValue],
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
