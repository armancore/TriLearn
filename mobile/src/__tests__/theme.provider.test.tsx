import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Appearance, Text } from 'react-native';

import {
  ThemeProvider,
  resolveThemeName,
  useTheme,
  useThemePreferenceStore,
} from '@/src/theme/ThemeProvider';
import { darkColors, lightColors } from '@/src/theme/tokens';

const Probe = () => {
  const { name, colors, systemScheme, preference } = useTheme();

  return (
    <>
      <Text testID="name">{name}</Text>
      <Text testID="system">{systemScheme}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="background">{colors.background}</Text>
    </>
  );
};

const setSystemScheme = (scheme: 'light' | 'dark') => {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
};

const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>);

describe('resolveThemeName', () => {
  it('follows the OS when the preference is "system"', () => {
    expect(resolveThemeName('system', 'dark')).toBe('dark');
    expect(resolveThemeName('system', 'light')).toBe('light');
  });

  it('overrides the OS when an explicit preference is set', () => {
    expect(resolveThemeName('light', 'dark')).toBe('light');
    expect(resolveThemeName('dark', 'light')).toBe('dark');
  });
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    act(() => {
      useThemePreferenceStore.setState({ preference: 'system', isHydrated: true });
    });
  });

  it('paints the OS theme while the preference is "system"', () => {
    setSystemScheme('dark');
    renderProbe();

    expect(screen.getByTestId('name')).toHaveTextContent('dark');
    expect(screen.getByTestId('background')).toHaveTextContent(darkColors.background);
  });

  it('applies a manual override immediately', () => {
    setSystemScheme('dark');
    renderProbe();

    act(() => {
      useThemePreferenceStore.getState().setPreference('light');
    });

    expect(screen.getByTestId('name')).toHaveTextContent('light');
    expect(screen.getByTestId('background')).toHaveTextContent(lightColors.background);
  });

  /**
   * The regression that made light/dark stop syncing: the provider used to
   * write the chosen scheme back into `Appearance`, which is the same value it
   * read the OS setting from. Overriding therefore destroyed the OS value and
   * "System" could never return to it.
   */
  it('keeps the OS scheme intact after an override, so "system" can return to it', () => {
    setSystemScheme('dark');
    renderProbe();

    act(() => {
      useThemePreferenceStore.getState().setPreference('light');
    });

    expect(screen.getByTestId('name')).toHaveTextContent('light');
    // The OS value must still be reported as dark, not overwritten to light.
    expect(screen.getByTestId('system')).toHaveTextContent('dark');

    act(() => {
      useThemePreferenceStore.getState().setPreference('system');
    });

    expect(screen.getByTestId('name')).toHaveTextContent('dark');
  });

  it('never writes back to the app-level Appearance', () => {
    const setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    setSystemScheme('light');
    renderProbe();

    act(() => {
      useThemePreferenceStore.getState().setPreference('dark');
    });

    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('follows a live OS change while the preference is "system"', () => {
    setSystemScheme('light');

    // Capture the listener the provider registers so the OS change can be driven.
    let notify: ((event: { colorScheme: 'light' | 'dark' }) => void) | undefined;
    jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
      notify = listener as typeof notify;
      return { remove: () => {} };
    });

    renderProbe();
    expect(screen.getByTestId('name')).toHaveTextContent('light');

    act(() => {
      setSystemScheme('dark');
      notify?.({ colorScheme: 'dark' });
    });

    expect(screen.getByTestId('name')).toHaveTextContent('dark');
  });

  it('ignores a live OS change while an explicit preference is set', () => {
    setSystemScheme('light');
    renderProbe();

    act(() => {
      useThemePreferenceStore.getState().setPreference('dark');
    });

    expect(screen.getByTestId('name')).toHaveTextContent('dark');

    act(() => {
      setSystemScheme('light');
    });

    // Still dark: the manual choice wins over the OS.
    expect(screen.getByTestId('name')).toHaveTextContent('dark');
  });
});
