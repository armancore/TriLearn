const normalizeIpAddress = (/** @type {unknown} */ value) => String(value || '').trim().toLowerCase().replace(/^::ffff:/, '')

const parseIpv4Octets = (/** @type {string} */ hostname) => {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null
  }

  const octets = hostname.split('.').map((/** @type {string} */ segment) => Number.parseInt(segment, 10))
  if (octets.some((/** @type {number} */ segment) => segment < 0 || segment > 255)) {
    return null
  }

  return octets
}

const isPrivateIpv4 = (/** @type {string} */ hostname) => {
  const octets = parseIpv4Octets(hostname)
  if (!octets) {
    return false
  }

  const [first, second] = octets

  return first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168
}

const isPrivateIpv6 = (/** @type {string} */ hostname) => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  return normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
}

module.exports = {
  normalizeIpAddress,
  parseIpv4Octets,
  isPrivateIpv4,
  isPrivateIpv6
}
