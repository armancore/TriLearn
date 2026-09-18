const { signQrPayload, verifyQrPayload } = require('../../utils/qrSigning')
const { hashToken } = require('../../utils/token')

const parseQrPayload = (/** @type {string} */ qrData) => {
  return verifyQrPayload(qrData)?.payload || null
}

const createSignedQrPayload = (/** @type {Parameters<typeof signQrPayload>[0]} */ payload) => signQrPayload(payload)
const hashQrPayload = (/** @type {string} */ qrData) => (typeof qrData === 'string' && qrData.trim() ? hashToken(qrData) : null)

module.exports = {
  parseQrPayload,
  createSignedQrPayload,
  hashQrPayload
}
