/**
 * TriLearn design tokens — "academic teal".
 *
 * A calm, institutional teal-green with warm neutrals and green-tinted
 * surfaces, chosen to read as considered rather than corporate and to stay
 * comfortable over long reading sessions.
 *
 * Every pair below is asserted against WCAG 2.1 AA by
 * `src/__tests__/theme.contrast.test.ts` — body text at least 4.5:1 on its
 * background, non-text UI at least 3:1. Add a token here and add its pairing
 * to that test; do not hand-check ratios.
 */

import { Platform, type ViewStyle } from 'react-native';

export type ThemeName = 'light' | 'dark';

const teal = {
  50: '#EFF7F5',
  100: '#D6EBE7',
  200: '#AFD8D1',
  300: '#7DD3C8',
  400: '#3FA99C',
  500: '#14867B',
  600: '#0F766E',
  700: '#0B5A54',
  800: '#08423E',
  900: '#052B28',
} as const;

const amber = {
  50: '#FEF7E7',
  100: '#FDECC8',
  200: '#FBD989',
  300: '#FBBF24',
  400: '#E29B0B',
  500: '#C07C08',
  600: '#A16207',
  700: '#854D0E',
  800: '#5C350A',
  900: '#3A2106',
} as const;

export const palette = { teal, amber } as const;

export interface ThemeColors {
  /** App canvas behind all content. */
  background: string;
  /** Raised container (cards, sheets, inputs). */
  surface: string;
  /** Surface nested inside a card — stat tiles, wells. */
  surfaceMuted: string;
  /** Pressed feedback fill. */
  surfacePressed: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Stronger border for focus rings and selected outlines. */
  borderStrong: string;

  /** Primary body copy. */
  text: string;
  /** Secondary copy — labels, descriptions. */
  textMuted: string;
  /** Tertiary copy — timestamps, captions. Still at least 4.5:1. */
  textSubtle: string;
  /** Copy that sits on a `primary` fill. */
  textOnPrimary: string;

  /**
   * Fill colour for solid primary surfaces (buttons, hero cards). Always dark
   * enough that `textOnPrimary` clears 4.5:1 on top of it — which is why the
   * dark theme does NOT simply lighten this.
   */
  primary: string;
  primaryHover: string;
  /**
   * Primary as *ink*: tinted text, icons, focus rings, progress fills and
   * selected borders drawn on `background` or `surface`. In the dark theme this
   * is a light teal, the inverse of `primary`.
   */
  primaryText: string;
  primarySoft: string;
  primarySoftText: string;

  accent: string;
  accentSoft: string;
  accentSoftText: string;

  success: string;
  successSoft: string;
  successSoftText: string;

  warning: string;
  warningSoft: string;
  warningSoftText: string;

  danger: string;
  dangerSoft: string;
  dangerSoftText: string;

  info: string;
  infoSoft: string;
  infoSoftText: string;

  /** Skeleton base and shimmer highlight. */
  skeleton: string;
  skeletonHighlight: string;

  /** Scrim behind modals and sheets. */
  scrim: string;

  /** Chrome: navigation bars and tab bars. */
  headerBackground: string;
  headerText: string;
  tabBarBackground: string;
  tabBarActive: string;
  tabBarInactive: string;
  tabBarBorder: string;
}

export const lightColors: ThemeColors = {
  /** Warm green-grey canvas. */
  background: '#F5F8F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3F1',
  surfacePressed: '#E1EAE7',
  border: '#DCE5E2',
  borderStrong: '#7C8F89',

  text: '#0F1F1C',
  textMuted: '#45564F',
  textSubtle: '#566A63',
  textOnPrimary: '#FFFFFF',

  primary: teal[600],
  primaryHover: teal[700],
  primaryText: teal[600],
  primarySoft: teal[50],
  primarySoftText: teal[700],

  accent: amber[600],
  accentSoft: amber[50],
  accentSoftText: amber[700],

  success: '#15803D',
  successSoft: '#E7F6EC',
  successSoftText: '#14622F',

  warning: amber[600],
  warningSoft: amber[50],
  warningSoftText: amber[700],

  danger: '#B42318',
  dangerSoft: '#FDECEA',
  dangerSoftText: '#912018',

  info: '#0E7490',
  infoSoft: '#E4F3F8',
  infoSoftText: '#0B5A70',

  skeleton: '#E3EBE8',
  skeletonHighlight: '#F1F6F4',

  scrim: 'rgba(6, 24, 20, 0.45)',

  headerBackground: '#FFFFFF',
  headerText: '#0F1F1C',
  tabBarBackground: '#FFFFFF',
  tabBarActive: teal[600],
  tabBarInactive: '#566A63',
  tabBarBorder: '#DCE5E2',
};

export const darkColors: ThemeColors = {
  background: '#0A1412',
  surface: '#12211E',
  surfaceMuted: '#1A2C28',
  surfacePressed: '#243934',
  border: '#263B36',
  borderStrong: '#5F7B74',

  text: '#EAF2EF',
  textMuted: '#A9BDB7',
  textSubtle: '#8CA39C',
  textOnPrimary: '#FFFFFF',

  // Kept dark, not lightened: white button labels must clear 4.5:1 on it.
  primary: teal[600],
  primaryHover: teal[500],
  // The inverse — teal as ink on a dark surface.
  primaryText: teal[300],
  primarySoft: '#10312C',
  primarySoftText: '#9BE0D3',

  accent: amber[300],
  accentSoft: '#2E2610',
  accentSoftText: '#F8D48A',

  success: '#4ADE80',
  successSoft: '#102A1B',
  successSoftText: '#86E5A6',

  warning: amber[300],
  warningSoft: '#2E2610',
  warningSoftText: '#F8D48A',

  danger: '#FB7C6E',
  dangerSoft: '#331A18',
  dangerSoftText: '#FCA79C',

  info: '#67C6DC',
  infoSoft: '#10262E',
  infoSoftText: '#9BD6E6',

  skeleton: '#1B2E2A',
  skeletonHighlight: '#263B36',

  scrim: 'rgba(3, 10, 8, 0.68)',

  headerBackground: '#12211E',
  headerText: '#EAF2EF',
  tabBarBackground: '#12211E',
  tabBarActive: teal[300],
  tabBarInactive: '#8CA39C',
  tabBarBorder: '#263B36',
};

export const themes: Record<ThemeName, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/** 4pt base scale. Screens use `xl` gutters, cards `xl` padding. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;

/**
 * Minimum interactive size. iOS HIG asks for 44pt, Material for 48dp, and
 * WCAG 2.1 target-size (AAA) for 44 CSS px. 48 satisfies all three.
 */
export const MIN_TOUCH_TARGET = 48;

/** Caps runaway OS font scaling on dense numeric UI without blocking it. */
export const MAX_FONT_SCALE = 1.6;
export const MAX_FONT_SCALE_DISPLAY = 1.3;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} as const;

/** A platform-appropriate shadow: `boxShadow` on web, `shadow*` on native. */
export type ElevationStyle = ViewStyle;

/** #rrggbb + alpha → the rgba() string `boxShadow` needs. */
const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * React Native Web deprecated the `shadow*` props in favour of `boxShadow`, so
 * each platform gets the form it actually supports. `elevation` stays for
 * Android, which does not read either shadow API.
 */
const shadow = (
  color: string,
  opacity: number,
  offsetY: number,
  blur: number,
  androidElevation: number,
): ElevationStyle =>
  Platform.OS === 'web'
    ? { boxShadow: `0px ${offsetY}px ${blur}px ${withAlpha(color, opacity)}` }
    : {
        shadowColor: color,
        shadowOffset: { width: 0, height: offsetY },
        shadowOpacity: opacity,
        shadowRadius: blur,
        elevation: androidElevation,
      };

/**
 * Shadows read as noise on dark surfaces, so the dark theme leans on surface
 * lightness for separation and keeps shadow opacity low.
 */
export const elevation = (
  theme: ThemeName,
): Record<'none' | 'sm' | 'md' | 'lg', ElevationStyle> => {
  const isDark = theme === 'dark';
  const color = isDark ? '#000000' : '#0B231E';

  return {
    none: Platform.OS === 'web' ? { boxShadow: 'none' } : { elevation: 0 },
    sm: shadow(color, isDark ? 0.24 : 0.05, 1, 3, 1),
    md: shadow(color, isDark ? 0.3 : 0.08, 4, 10, 3),
    lg: shadow(color, isDark ? 0.38 : 0.12, 10, 24, 8),
  };
};
