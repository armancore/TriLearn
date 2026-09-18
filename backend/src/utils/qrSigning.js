const crypto = require('crypto')
const { getRequiredSecret } = require('./security')

const LEGACY_QR_KID = 'legacy'

const isLegacyKeyDisabled = () => String(process.env.QR_DISABLE_LEGACY_KEY || '')
  .trim()
  .toLowerCase() === 'true'

const parseConfiguredKeys = () => {
  const configured = String(process.env.QR_SIGNING_SECRET_KEYS || '').trim()
  const keys = new Map(/** @type {[string, string][]} */ ([]))

  if (configured) {
    configured
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const separatorIndex = entry.indexOf(':')
        if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
          throw new Error('QR_SIGNING_SECRET_KEYS entries must use the format kid:secret')
        }

        const kid = entry.slice(0, separatorIndex).trim()
        const secret = entry.slice(separatorIndex + 1).trim()

        if (!kid || !secret) {
          throw new Error('QR signing keys must include both kid and secret')
        }

        keys.set(kid, secret)
      })
  }

  if (!configured || !isLegacyKeyDisabled()) {
    keys.set(LEGACY_QR_KID, getRequiredSecret('QR_SIGNING_SECRET'))
  }

  return keys
}

/** @type {Map<string, string> | null} */
let _cachedKeys = null
const clearQrSigningKeyCache = () => {
  _cachedKeys = null
}

const getQrSigningKeys = () => {
  if (!_cachedKeys) {
    _cachedKeys = parseConfiguredKeys()
  }
  return _cachedKeys
}

const getActiveQrSigningKey = () => {
  const keys = getQrSigningKeys()
  const configuredActiveKid = String(process.env.QR_SIGNING_ACTIVE_KID || '').trim()

  if (configuredActiveKid) {
    const secret = keys.get(configuredActiveKid)
    if (!secret) {
      throw new Error(`QR_SIGNING_ACTIVE_KID "${configuredActiveKid}" is not configured`)
    }

    return { kid: configuredActiveKid, secret }
  }

  const firstNonLegacy = [...keys.entries()].find(([kid]) => kid !== LEGACY_QR_KID)
  if (firstNonLegacy) {
    return { kid: firstNonLegacy[0], secret: firstNonLegacy[1] }
  }

  const secret = keys.get(LEGACY_QR_KID)
  if (!secret) throw new Error("No QR signing key is configured")
  return { kid: LEGACY_QR_KID, secret }
}

const signQrPayload = (/** @type {unknown} */ payload) => {
  const { kid, secret } = getActiveQrSigningKey()
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')

  return JSON.stringify({ payload, signature, kid })
}

const verifyQrPayload = (/** @type {string} */ qrData) => {
  try {
    const parsed = JSON.parse(qrData)
    if (!parsed || typeof parsed !== 'object') return null

    const payload = parsed.payload
    const signature = parsed.signature
    const kid = typeof parsed.kid === 'string' ? parsed.kid : null

    if (!payload || typeof payload !== 'object' || typeof signature !== 'string') {
      return null
    }

    const signatureBuffer = Buffer.from(signature, 'hex')
    const keys = getQrSigningKeys()
    const candidateEntries = kid
      ? (keys.has(kid) ? [[kid, keys.get(kid)]] : [])
      : [...keys.entries()]

    for (const [, secret] of candidateEntries) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex')
      const expectedBuffer = Buffer.from(expectedSignature, 'hex')

      if (
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        return { payload, kid }
      }
    }

    return null
  } catch {
    return null
  }
}

module.exports = {
  LEGACY_QR_KID,
  clearQrSigningKeyCache,
  getQrSigningKeys,
  getActiveQrSigningKey,
  signQrPayload,
  verifyQrPayload
}
