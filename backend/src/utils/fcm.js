const https = require('node:https')
const { JWT } = require('google-auth-library')
const logger = require('./logger')

const FCM_HOST = 'fcm.googleapis.com'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const MAX_FCM_SEND_ATTEMPTS = 2
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504])
const STALE_ERROR_CODES = new Set([
  'NotRegistered',
  'InvalidRegistration',
  'UNREGISTERED',
  'registration-token-not-registered'
])
let cachedFcmAuth = null

const normalizeDataPayload = (data = {}) => Object.entries(data || {}).reduce((acc, [key, value]) => {
  if (value === undefined || value === null) {
    return acc
  }

  acc[key] = typeof value === 'string' ? value : JSON.stringify(value)
  return acc
}, {})

const getTokenSuffix = (token) => String(token || '').slice(-8)

const parseFcmResponseBody = (text) => {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const buildTokenResult = ({
  token,
  success = false,
  skipped = false,
  status = null,
  messageId = null,
  errorCode = null,
  errorMessage = null
}) => ({
  token,
  success,
  skipped,
  status,
  messageId,
  errorCode,
  errorMessage,
  stale: status === 404 || STALE_ERROR_CODES.has(errorCode),
  retryable: RETRYABLE_STATUS_CODES.has(status)
})

const parseServiceAccountJson = () => {
  const rawJson = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim()

  if (!rawJson) {
    return null
  }

  try {
    const serviceAccount = JSON.parse(rawJson)
    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      throw new Error('missing client_email, private_key, or project_id')
    }

    return serviceAccount
  } catch (error) {
    logger.error('Invalid FCM_SERVICE_ACCOUNT_JSON configuration', { message: error.message })
    return null
  }
}

const getFcmAuth = () => {
  const serviceAccount = parseServiceAccountJson()
  if (!serviceAccount) {
    return null
  }

  const cacheKey = `${serviceAccount.project_id}:${serviceAccount.client_email}:${serviceAccount.private_key}`
  if (cachedFcmAuth?.cacheKey === cacheKey) {
    return cachedFcmAuth
  }

  cachedFcmAuth = {
    cacheKey,
    projectId: serviceAccount.project_id,
    client: new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [FCM_SCOPE]
    })
  }

  return cachedFcmAuth
}

const getFcmAccessToken = async (client) => {
  const headers = await client.getRequestHeaders()
  const authorization = typeof headers.get === 'function'
    ? headers.get('authorization')
    : headers.Authorization || headers.authorization
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    throw new Error('Google auth library did not return an FCM access token')
  }

  return token
}

const postFcmPayload = ({ projectId, accessToken, payload }) => new Promise((resolve, reject) => {
  const requestBody = JSON.stringify(payload)
  const request = https.request({
    hostname: FCM_HOST,
    path: `/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    }
  }, (response) => {
    const chunks = []

    response.on('data', (chunk) => {
      chunks.push(chunk)
    })

    response.on('end', () => {
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        statusText: response.statusMessage,
        body: Buffer.concat(chunks).toString('utf8')
      })
    })
  })

  request.on('error', reject)
  request.write(requestBody)
  request.end()
})

const sendToToken = async ({ token, title, body, data, projectId, accessToken }) => {
  const response = await postFcmPayload({
    projectId,
    accessToken,
    payload: {
      message: {
        token,
        notification: {
          title,
          body
        },
        data: normalizeDataPayload(data)
      }
    }
  })

  const payload = parseFcmResponseBody(response.body)
  const fcmError = payload?.error?.details?.find((detail) => detail?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')
  const errorCode = fcmError?.errorCode || payload?.error?.status || payload?.error
  const messageId = payload?.name || null

  if (response.ok && !errorCode) {
    return buildTokenResult({
      token,
      success: true,
      status: response.status,
      messageId
    })
  }

  return buildTokenResult({
    token,
    status: response.status,
    messageId,
    errorCode,
    errorMessage: payload?.error?.message || response.statusText
  })
}

const sendPushNotification = async (tokens = [], title, body, data = {}) => {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))]

  if (!uniqueTokens.length) {
    return []
  }

  const fcmAuth = getFcmAuth()
  if (!fcmAuth) {
    return uniqueTokens.map((token) => {
      const result = buildTokenResult({ token, skipped: true, errorCode: 'FCM_SERVICE_ACCOUNT_JSON_MISSING' })
      logger.warn('FCM push skipped because FCM_SERVICE_ACCOUNT_JSON is not configured', {
        tokenSuffix: getTokenSuffix(token)
      })
      return result
    })
  }

  const accessToken = await getFcmAccessToken(fcmAuth.client)

  return Promise.all(uniqueTokens.map(async (token) => {
    try {
      let result

      for (let attempt = 1; attempt <= MAX_FCM_SEND_ATTEMPTS; attempt += 1) {
        result = await sendToToken({
          token,
          title,
          body,
          data,
          projectId: fcmAuth.projectId,
          accessToken
        })

        if (!result.retryable || attempt === MAX_FCM_SEND_ATTEMPTS) {
          break
        }

        logger.warn('Retrying FCM push after transient failure', {
          tokenSuffix: getTokenSuffix(token),
          status: result.status,
          errorCode: result.errorCode,
          attempt
        })
      }

      if (result.success) {
        logger.info('FCM push delivered', {
          tokenSuffix: getTokenSuffix(token),
          status: result.status,
          messageId: result.messageId
        })
      } else {
        logger.warn('FCM push failed', {
          tokenSuffix: getTokenSuffix(token),
          status: result.status,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          stale: result.stale,
          retryable: result.retryable
        })
      }

      return result
    } catch (error) {
      logger.error('FCM push failed', {
        tokenSuffix: getTokenSuffix(token),
        message: error.message,
        stack: error.stack,
        retryable: true
      })

      return buildTokenResult({
        token,
        errorCode: 'FCM_REQUEST_FAILED',
        errorMessage: error.message
      })
    }
  }))
}

module.exports = {
  sendPushNotification,
  hasFcmServiceAccount: () => Boolean(parseServiceAccountJson()),
  _resetFcmAuthForTests: () => {
    cachedFcmAuth = null
  }
}
