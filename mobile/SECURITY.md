# Mobile Security Audit Notes

Last reviewed: 2026-05-02

`npm audit fix` was run without `--force`. The remaining moderate findings require breaking Expo/Jest Expo upgrades according to npm audit.

| Package | Severity | Advisory URL | React Native exploitability note |
| --- | --- | --- | --- |
| postcss | Moderate | https://github.com/advisories/GHSA-qx2v-qp2m-jg93 | Likely not exploitable in the shipped React Native app. This is in the Expo Metro/tooling chain and concerns CSS stringification output, not runtime mobile code. |
| uuid | Moderate | https://github.com/advisories/GHSA-w5hq-g745-h8pq | Likely not exploitable in the shipped React Native app. The vulnerable path is through Expo config/xcode tooling and requires direct use of v3/v5/v6 APIs with a caller-provided buffer. |
