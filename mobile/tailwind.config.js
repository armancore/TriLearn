/** @type {import('tailwindcss').Config} */

// Mirrors src/theme/tokens.ts ("academic teal").
//
// NOTE: the app styles through `useTheme()`, not `dark:` classes — see
// src/theme/ThemeProvider.tsx for why NativeWind is not driven from there.
// This config exists so `className` stays usable and consistent if needed.
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teal: {
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
        },
        primary: '#0F766E',
        accent: '#A16207',

        // Light theme semantics (dark values are applied with `dark:` variants).
        canvas: '#F5F8F7',
        surface: '#FFFFFF',
        'surface-muted': '#EEF3F1',
        'surface-pressed': '#E1EAE7',
        hairline: '#DCE5E2',
        'hairline-strong': '#7C8F89',
        ink: '#0F1F1C',
        'ink-muted': '#45564F',
        'ink-subtle': '#566A63',

        // Dark theme semantics.
        'canvas-dark': '#0A1412',
        'surface-dark': '#12211E',
        'surface-muted-dark': '#1A2C28',
        'surface-pressed-dark': '#243934',
        'hairline-dark': '#263B36',
        'hairline-strong-dark': '#5F7B74',
        'ink-dark': '#EAF2EF',
        'ink-muted-dark': '#A9BDB7',
        'ink-subtle-dark': '#8CA39C',
        'primary-dark': '#0F766E',
        'primary-ink-dark': '#7DD3C8',
      },
      borderRadius: {
        card: '16px',
        panel: '20px',
        sheet: '24px',
      },
      fontSize: {
        label: ['12px', '16px'],
        caption: ['13px', '18px'],
        body: ['15px', '22px'],
        subheading: ['17px', '24px'],
        heading: ['20px', '26px'],
        title: ['24px', '30px'],
        display: ['32px', '38px'],
      },
    },
  },
  plugins: [],
};
