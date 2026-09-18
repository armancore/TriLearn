/** @typedef {{ hostname?: string, headers?: import("http").IncomingHttpHeaders, secure?: boolean }} CookieRequest */
const { isPrivateIpv4, isPrivateIpv6 } = require('./network')

const getRequestHost = (/** @type {CookieRequest | undefined} */ req) => String(req?.hostname || req?.headers?.host || '')
  .split(':')[0]
  .trim()
  .toLowerCase()

const isLocalHost = (/** @type {string} */ host) => (
  host === 'localhost' ||
  host.endsWith('.local') ||
  isPrivateIpv4(host) ||
  isPrivateIpv6(host)
)

// req.secure honors the app-level `trust proxy` setting (see getTrustProxySetting
// in index.js). The raw x-forwarded-proto header is trusted as an additional
// fallback so a correctly proxied HTTPS request is still recognised when the
// caller has not configured `trust proxy` (e.g. isolated test apps). On the
// deployment targets the Node process is never reachable directly, so a client
// cannot forge this header to bypass the check. Keep enforceHttps aligned.
const isSecureRequest = (/** @type {CookieRequest | undefined} */ req) => {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()

  return req?.secure === true || forwardedProto === 'https'
}

// Single source of truth for cookie Secure/SameSite derivation shared by the
// access, refresh, and CSRF cookies so their security attributes cannot drift
// apart. Any non-local host forces Secure (and therefore SameSite=None) because
// the Render API + Vercel frontend deployment is cross-site.
const getCookieSecurity = (/** @type {CookieRequest | undefined} */ req) => isSecureRequest(req) || !isLocalHost(getRequestHost(req))

module.exports = {
  getRequestHost,
  isLocalHost,
  isSecureRequest,
  getCookieSecurity
}
