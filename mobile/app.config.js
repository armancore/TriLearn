const os = require('os');

const base = require('./app.json');

const BACKEND_PORT = 5000;
const WEB_PORT = 5173;

/**
 * Virtual adapters (Hyper-V, WSL, VirtualBox, VMware, Docker) hand out IPv4
 * addresses that a phone on the Wi-Fi cannot route to, so they are skipped.
 */
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Bluetooth/i;

/** Private ranges, best first: Wi-Fi/LAN subnets before carrier-grade ranges. */
const PRIVATE_RANGE_RANK = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

const rank = (address) => {
  const index = PRIVATE_RANGE_RANK.findIndex((pattern) => pattern.test(address));
  return index === -1 ? PRIVATE_RANGE_RANK.length : index;
};

/**
 * Resolves the LAN address a physical device can reach this machine on.
 *
 * The dev-server host changes every time the laptop joins a different network,
 * and a stale hardcoded IP shows up in the app as "cannot connect to the
 * TriLearn server". Detecting it at config time keeps the two in step.
 */
const detectLanHost = () => {
  const candidates = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) {
      continue;
    }

    for (const entry of addresses ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push({ name, address: entry.address });
      }
    }
  }

  candidates.sort((left, right) => rank(left.address) - rank(right.address));

  return candidates[0]?.address ?? 'localhost';
};

module.exports = () => {
  // An explicit EXPO_PUBLIC_* value in .env always wins; these are the
  // fallbacks that `src/constants/config.ts` reads from `extra`.
  const host = process.env.EXPO_PUBLIC_DEV_HOST || detectLanHost();

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[trilearn] API host resolved to ${host}`);
  }

  return {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      apiBaseUrl: `http://${host}:${BACKEND_PORT}/api/v1`,
      socketUrl: `http://${host}:${BACKEND_PORT}`,
      webAppUrl: `http://${host}:${WEB_PORT}`,
    },
  };
};
