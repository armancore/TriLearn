# Mobile Security Audit Notes

Last reviewed: 2026-05-02

The Expo SDK dependency remediation has been completed.

## 2026-05-02 Expo SDK Upgrade

The mobile app was upgraded from Expo SDK 54 to Expo SDK 55 using the current
Expo upgrade flow:

```bash
npm install expo@^55.0.0
npx expo install --fix
```

The previous 19 npm audit findings, reported as 4 low and 15 moderate, traced
through the Expo tooling dependency path:

```text
expo-constants -> expo-linking -> expo-router -> @expo/prebuild-config -> expo-splash-screen
```

After the SDK upgrade, Expo dependency alignment, and targeted npm overrides for
tooling-only transitive packages (`@tootallnate/once`, `postcss`, and `uuid`),
`npm audit` reports 0 vulnerabilities.

Verification completed:

```bash
npm audit
npx expo-doctor
npm test
```

Results:

- `npm audit`: 0 vulnerabilities
- `npx expo-doctor`: 18/18 checks passed
- `npm test`: 2 test suites passed, 5 tests passed

Remaining release validation: smoke test Android and iOS builds on physical or
emulated devices before shipping the upgraded mobile app.
