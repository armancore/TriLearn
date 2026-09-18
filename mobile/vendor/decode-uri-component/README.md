# CommonJS compatibility copy

Source: decode-uri-component 0.5.0 from the npm registry (SHA-1 4592fa1e1d640ec5e2760e2e168ad2ab5f2c9da1). Includes the upstream linear-time malformed UTF-8 decoder fixing GHSA-vcc3-ghjq-m6fr. Only the default ESM export was converted to module.exports; decoding logic is unchanged.

Expo Router 55 uses query-string 7, which requires a callable CommonJS decoder. Overriding it with the upstream ESM package breaks that contract. Remove this compatibility copy when Expo Router supports the patched upstream package directly. The MIT license is retained.
