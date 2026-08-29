import { describe, expect, it } from '@jest/globals';

import { darkColors, lightColors, type ThemeColors } from '@/src/theme/tokens';

/** Relative luminance per WCAG 2.1, from a #rrggbb string. */
const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);

  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (foreground: string, background: string): number => {
  const a = luminance(foreground);
  const b = luminance(background);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and non-text UI. */
const TEXT_MIN = 4.5;
const UI_MIN = 3;

type Pair = [name: string, foreground: keyof ThemeColors, background: keyof ThemeColors];

/**
 * Text pairings that must clear 4.5:1. `textOnPrimary` over `primary` is the
 * one that regressed before — a lightened dark-theme primary put white button
 * labels at 2.84:1 — so it is pinned here in both themes.
 */
const TEXT_PAIRS: Pair[] = [
  ['body on canvas', 'text', 'background'],
  ['body on surface', 'text', 'surface'],
  ['body on muted surface', 'text', 'surfaceMuted'],
  ['muted on canvas', 'textMuted', 'background'],
  ['muted on surface', 'textMuted', 'surface'],
  ['muted on muted surface', 'textMuted', 'surfaceMuted'],
  ['subtle on canvas', 'textSubtle', 'background'],
  ['subtle on surface', 'textSubtle', 'surface'],
  ['subtle on muted surface', 'textSubtle', 'surfaceMuted'],

  ['label on primary fill', 'textOnPrimary', 'primary'],
  ['primary ink on canvas', 'primaryText', 'background'],
  ['primary ink on surface', 'primaryText', 'surface'],

  ['primary badge', 'primarySoftText', 'primarySoft'],
  ['accent badge', 'accentSoftText', 'accentSoft'],
  ['success badge', 'successSoftText', 'successSoft'],
  ['warning badge', 'warningSoftText', 'warningSoft'],
  ['danger badge', 'dangerSoftText', 'dangerSoft'],
  ['info badge', 'infoSoftText', 'infoSoft'],

  ['danger text on surface', 'danger', 'surface'],
  ['tab bar active label', 'tabBarActive', 'tabBarBackground'],
  ['tab bar inactive label', 'tabBarInactive', 'tabBarBackground'],
  ['header title', 'headerText', 'headerBackground'],
];

/** Graphics and boundaries: icons, progress fills, focus rings. */
const UI_PAIRS: Pair[] = [
  ['strong border on surface', 'borderStrong', 'surface'],
  ['progress fill on track', 'primaryText', 'surfaceMuted'],
  ['success indicator on surface', 'success', 'surface'],
  ['warning indicator on surface', 'warning', 'surface'],
  ['danger indicator on surface', 'danger', 'surface'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme contrast', (_themeName, colors) => {
  it.each(TEXT_PAIRS)('%s meets AA for text', (_label, foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(UI_PAIRS)('%s meets AA for non-text UI', (_label, foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(UI_MIN);
  });

  it('keeps every colour token a valid hex or rgba value', () => {
    for (const [token, value] of Object.entries(colors)) {
      expect(`${token}=${value}`).toMatch(/=(#[0-9A-Fa-f]{6}|rgba?\([\d.,\s]+\))$/);
    }
  });
});
