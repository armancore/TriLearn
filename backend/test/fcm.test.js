const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const https = require('node:https')

const fcmPath = path.resolve(__dirname, '..', 'src', 'utils', 'fcm.js')

const serviceAccountJson = JSON.stringify({
  project_id: 'trilearn-project',
  client_email: 'firebase-adminsdk@trilearn-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
})

const loadFcmWithAuthMock = ({ getRequestHeaders = async () => ({ Authorization: 'Bearer access-token' }) } = {}) => {
  const localRequire = createRequire(fcmPath)
  const googleAuthPath = localRequire.resolve('google-auth-library')
  const previousGoogleAuth = require.cache[googleAuthPath]
  const jwtConstructors = []

  require.cache[googleAuthPath] = {
    id: googleAuthPath,
    filename: googleAuthPath,
    loaded: true,
    exports: {
      JWT: class MockJwt {
        constructor (options) {
          jwtConstructors.push(options)
        }

        async getRequestHeaders () {
          return getRequestHeaders()
        }
      }
    }
  }

  delete require.cache[fcmPath]
  const fcm = require(fcmPath)

  return {
    fcm,
    jwtConstructors,
    restore: () => {
      delete require.cache[fcmPath]
      if (previousGoogleAuth) {
        require.cache[googleAuthPath] = previousGoogleAuth
      } else {
        delete require.cache[googleAuthPath]
      }
    }
  }
}

const withEnv = async (updates, fn) => {
  const previous = {}
  Object.keys(updates).forEach((key) => {
    previous[key] = process.env[key]
    if (updates[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = updates[key]
    }
  })

  try {
    return await fn()
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    })
  }
}

const mockHttpsRequest = ({ statusCode = 200, statusMessage = 'OK', body = {} }) => {
  const calls = []
  const originalRequest = https.request

  https.request = (options, callback) => {
    const request = new EventEmitter()
    const chunks = []

    request.write = (chunk) => {
      chunks.push(Buffer.from(chunk))
    }

    request.end = () => {
      const response = new EventEmitter()
      response.statusCode = statusCode
      response.statusMessage = statusMessage
      calls.push({
        options,
        body: Buffer.concat(chunks).toString('utf8')
      })

      callback(response)
      response.emit('data', Buffer.from(JSON.stringify(body)))
      response.emit('end')
    }

    return request
  }

  return {
    calls,
    restore: () => {
      https.request = originalRequest
    }
  }
}

test('sendPushNotification skips when FCM service account JSON is missing', async () => {
  await withEnv({ FCM_SERVICE_ACCOUNT_JSON: undefined }, async () => {
    const { fcm, restore } = loadFcmWithAuthMock()

    try {
      const results = await fcm.sendPushNotification(['token-a'], 'Title', 'Body')

      assert.equal(results.length, 1)
      assert.equal(results[0].token, 'token-a')
      assert.equal(results[0].skipped, true)
      assert.equal(results[0].errorCode, 'FCM_SERVICE_ACCOUNT_JSON_MISSING')
    } finally {
      restore()
    }
  })
})

test('sendPushNotification sends Firebase HTTP v1 messages with OAuth bearer auth', async () => {
  await withEnv({ FCM_SERVICE_ACCOUNT_JSON: serviceAccountJson }, async () => {
    const { fcm, jwtConstructors, restore: restoreFcm } = loadFcmWithAuthMock()
    const { calls, restore: restoreHttps } = mockHttpsRequest({
      body: {
        name: 'projects/trilearn-project/messages/message-1'
      }
    })

    try {
      const results = await fcm.sendPushNotification(
        ['token-a'],
        'Routine posted',
        'Your routine is ready.',
        { notificationId: 'notification-1', metadata: { routineId: 'routine-1' } }
      )

      assert.equal(jwtConstructors.length, 1)
      assert.deepEqual(jwtConstructors[0].scopes, ['https://www.googleapis.com/auth/firebase.messaging'])
      assert.equal(calls.length, 1)
      assert.equal(calls[0].options.hostname, 'fcm.googleapis.com')
      assert.equal(calls[0].options.path, '/v1/projects/trilearn-project/messages:send')
      assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token')
      assert.deepEqual(JSON.parse(calls[0].body), {
        message: {
          token: 'token-a',
          notification: {
            title: 'Routine posted',
            body: 'Your routine is ready.'
          },
          data: {
            notificationId: 'notification-1',
            metadata: '{"routineId":"routine-1"}'
          }
        }
      })
      assert.equal(results[0].success, true)
      assert.equal(results[0].messageId, 'projects/trilearn-project/messages/message-1')
    } finally {
      restoreHttps()
      restoreFcm()
    }
  })
})

test('sendPushNotification marks unregistered Firebase HTTP v1 tokens as stale', async () => {
  await withEnv({ FCM_SERVICE_ACCOUNT_JSON: serviceAccountJson }, async () => {
    const { fcm, restore: restoreFcm } = loadFcmWithAuthMock()
    const { restore: restoreHttps } = mockHttpsRequest({
      statusCode: 404,
      statusMessage: 'Not Found',
      body: {
        error: {
          code: 404,
          message: 'Requested entity was not found.',
          status: 'NOT_FOUND',
          details: [
            {
              '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              errorCode: 'UNREGISTERED'
            }
          ]
        }
      }
    })

    try {
      const results = await fcm.sendPushNotification(['token-stale'], 'Title', 'Body')

      assert.equal(results.length, 1)
      assert.equal(results[0].success, false)
      assert.equal(results[0].stale, true)
      assert.equal(results[0].status, 404)
      assert.equal(results[0].errorCode, 'UNREGISTERED')
      assert.equal(results[0].errorMessage, 'Requested entity was not found.')
    } finally {
      restoreHttps()
      restoreFcm()
    }
  })
})
