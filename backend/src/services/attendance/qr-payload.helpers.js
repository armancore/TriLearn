const { signQrPayload, verifyQrPayload } = require('../../utils/qrSigning')
const { hashToken } = require('../../utils/token')

const parseQrPayload = (qrData) => {
  return verifyQrPayload(qrData)?.payload || null
}

const createSignedQrPayload = (payload) => signQrPayload(payload)
const hashQrPayload = (qrData) => (typeof qrData === 'string' && qrData.trim() ? hashToken(qrData) : null)

module.exports = {
  parseQrPayload,
  createSignedQrPayload,
  hashQrPayload
}
