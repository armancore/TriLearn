import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  elevation as buildElevation,
  radius,
  spacing,
  themes,
  typography,
  type ElevationStyle,
  type ThemeColors,
  type ThemeName,
} from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'trilearn.theme-preference';

const memoryStorage = (() => {
  const values = new Map<string, string>();

  return {
    getItem: async (name: string) => values.get(name) ?? null,
    setItem: async (name: string, value: string) => {
      values.set(name, value);
    },
    removeItem: async (name: string) => {
      values.delete(name);
    },
  };
})();

const webStorage = {
  getItem: async (name: string) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      /* Storage can be unavailable in private browsing; the preference is not critical. */
    }
  },
  removeItem: async (name: string) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      /* See above. */
    }
  },
};

const nativeStorage = {
  getItem: async (name: string) => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {
      /* Preference is cosmetic — fall back to the system scheme next launch. */
    }
  },
  removeItem: async (name: string) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      /* See above. */
    }
  },
};

const preferenceStorage =
  Platform.OS === 'web' ? webStorage : Platform.OS === 'ios' || Platform.OS === 'android' ? nativeStorage : memoryStorage;

interface ThemePreferenceState {
  preference: ThemePreference;
  /** False until the stored preference has been read back. */
  isHydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
  setHydrated: () => void;
}

export const useThemePreferenceStore = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      preference: 'system',
      isHydrated: false,
      setPreference: (preference) => set({ preference }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => preferenceStorage),
      // Only the choice is persisted; hydration state is per-launch.
      partialize: (state) => ({ preference: state.preference }),
      // Runs whether or not a stored value existed, so a first launch does not
      // hang waiting for a preference that was never written.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Failed to restore the theme preference', error);
        }

        useThemePreferenceStore.getState().setHydrated();
        void state;
      },
    },
  ),
);

/**
 * The OS colour scheme.
 *
 * Deliberately NOT `useColorScheme()`: that hook reads the app-level
 * appearance, which an earlier version of this provider also wrote to via
 * `Appearance.setColorScheme`. Reading and writing the same value made the
 * provider its own input — once "Dark" was chosen the real OS preference was
 * overwritten and "System" could never recover it. This provider now only ever
 * reads the system scheme, and resolves the theme itself.
 */
const useSystemScheme = (): ThemeName => {
  const [scheme, setScheme] = useState<ThemeName>(() =>
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });

    // The OS scheme can change between the initial render and this effect.
    setScheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

    return () => subscription.remove();
  }, []);

  return scheme;
};

export interface Theme {
  name: ThemeName;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: Record<'none' | 'sm' | 'md' | 'lg', ElevationStyle>;
  preference: ThemePreference;
  /** The OS setting, regardless of the current preference. */
  systemScheme: ThemeName;
  /** False until the stored preference has loaded. */
  isHydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
}

/** The single place a preference plus an OS scheme becomes a concrete theme. */
export const resolveThemeName = (preference: ThemePreference, systemScheme: ThemeName): ThemeName =>
  preference === 'system' ? systemScheme : preference;

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemScheme();
  const preference = useThemePreferenceStore((state) => state.preference);
  const isHydrated = useThemePreferenceStore((state) => state.isHydrated);
  const setPreference = useThemePreferenceStore((state) => state.setPreference);

  const name = resolveThemeName(preference, systemScheme);

  /*
   * NativeWind is deliberately NOT driven from here. `colorScheme.set()` calls
   * `Appearance.setColorScheme()` under the hood, which is the same value this
   * provider reads the OS setting from — that hidden write was the second half
   * of the sync bug. Screens style through `useTheme()` and the codebase uses
   * no `dark:` classes, so there is nothing to keep in step. If `dark:`
   * variants are ever introduced, drive them from `name` here and switch
   * `useSystemScheme` to a value captured before the first write.
   */

  const value = useMemo<Theme>(
    () => ({
      name,
      isDark: name === 'dark',
      colors: themes[name],
      spacing,
      radius,
      typography,
      elevation: buildElevation(name),
      preference,
      systemScheme,
      isHydrated,
      setPreference,
    }),
    [isHydrated, name, preference, setPreference, systemScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);

  if (!theme) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }

  return theme;
};
