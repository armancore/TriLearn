const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const sourceRoot = resolveFromTest('src')
  const previousCacheKeys = new Set(Object.keys(require.cache))
  const touched = []

  for (const [request, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(request)
    touched.push({
      resolved,
      previous: require.cache[resolved]
    })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mockExports
    }
  }

  delete require.cache[modulePath]

  try {
    return require(modulePath)
  } finally {
    for (const cachedPath of Object.keys(require.cache)) {
      if (!previousCacheKeys.has(cachedPath) && cachedPath.startsWith(sourceRoot)) {
        delete require.cache[cachedPath]
      }
    }

    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

test('notification worker sends FCM pushes and removes stale device tokens', async () => {
  const emitted = []
  const pushCalls = []
  const deleteCalls = []
  const notifications = [
    {
      id: 'notification-1',
      userId: 'user-1',
      type: 'NOTICE_POSTED',
      title: 'Exam Routine',
      message: 'The exam routine has been posted.',
      link: '/student/notices',
      metadata: { noticeId: 'notice-1' },
      dedupeKey: 'notice:notice-1:user-1'
    }
  ]

  const { createNotificationRecords } = loadWithMocks(resolveFromTest('src', 'jobs', 'notificationWorker.js'), {
    '../utils/prisma': {
      notification: {
        createMany: async (payload) => ({ count: payload.data.length }),
        findMany: async () => notifications
      },
      deviceToken: {
        findMany: async () => ([
          { userId: 'user-1', token: 'token-ok', platform: 'ANDROID' },
          { userId: 'user-1', token: 'token-stale', platform: 'IOS' }
        ]),
        deleteMany: async (payload) => {
          deleteCalls.push(payload)
          return { count: payload.where.token.in.length }
        }
      }
    },
    '../utils/logger': {
      info: () => {},
      error: () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/fcm': {
      sendPushNotification: async (tokens, title, body, data) => {
        pushCalls.push({ tokens, title, body, data })
        return [
          { token: 'token-ok', success: true, stale: false },
          { token: 'token-stale', success: false, stale: true, errorCode: 'NotRegistered' }
        ]
      }
    },
    '../utils/realtime': {
      emitNotificationCreated: (userId, notification) => {
        emitted.push({ userId, notification })
      }
    },
    './notificationQueue': {
      NOTIFICATION_QUEUE_NAME: 'notifications',
      CREATE_NOTIFICATIONS_JOB: 'create-notifications',
      NOTICE_POSTED_JOB: 'notice-posted',
      PASSWORD_RESET_EMAIL_JOB: 'password-reset-email',
      BULK_STUDENT_IMPORT_JOB: 'bulk-student-import',
      getNotificationQueueConnection: () => null
    },
    bullmq: {
      Worker: class MockWorker {}
    }
  })

  const result = await createNotificationRecords(notifications, 'request-123')

  assert.equal(result.count, 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].userId, 'user-1')
  assert.equal(pushCalls.length, 1)
  assert.deepEqual(pushCalls[0].tokens, ['token-ok', 'token-stale'])
  assert.equal(pushCalls[0].title, 'Exam Routine')
  assert.equal(pushCalls[0].body, 'The exam routine has been posted.')
  assert.deepEqual(pushCalls[0].data, {
    notificationId: 'notification-1',
    type: 'NOTICE_POSTED',
    link: '/student/notices',
    metadata: { noticeId: 'notice-1' }
  })
  assert.equal(deleteCalls.length, 1)
  assert.deepEqual(deleteCalls[0].where.token.in, ['token-stale'])
})

test('notification worker keeps in-app delivery when FCM push fails', async () => {
  const emitted = []
  const loggedErrors = []
  const notifications = [
    {
      id: 'notification-2',
      userId: 'user-2',
      type: 'ANNOUNCEMENT',
      title: 'Class moved',
      message: 'Class moved to room 302.',
      link: '/student/notices',
      metadata: null,
      dedupeKey: 'announcement:user-2'
    }
  ]

  const { createNotificationRecords } = loadWithMocks(resolveFromTest('src', 'jobs', 'notificationWorker.js'), {
    '../utils/prisma': {
      notification: {
        createMany: async (payload) => ({ count: payload.data.length }),
        findMany: async () => notifications
      },
      deviceToken: {
        findMany: async () => ([
          { userId: 'user-2', token: 'token-fail', platform: 'ANDROID' }
        ]),
        deleteMany: async () => {
          throw new Error('deleteMany should not run')
        }
      }
    },
    '../utils/logger': {
      info: () => {},
      error: (message, meta) => {
        loggedErrors.push({ message, meta })
      }
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/fcm': {
      sendPushNotification: async () => {
        throw new Error('FCM unavailable')
      }
    },
    '../utils/realtime': {
      emitNotificationCreated: (userId, notification) => {
        emitted.push({ userId, notification })
      }
    },
    './notificationQueue': {
      NOTIFICATION_QUEUE_NAME: 'notifications',
      CREATE_NOTIFICATIONS_JOB: 'create-notifications',
      NOTICE_POSTED_JOB: 'notice-posted',
      PASSWORD_RESET_EMAIL_JOB: 'password-reset-email',
      BULK_STUDENT_IMPORT_JOB: 'bulk-student-import',
      getNotificationQueueConnection: () => null
    },
    bullmq: {
      Worker: class MockWorker {}
    }
  })

  const result = await createNotificationRecords(notifications, 'request-123')

  assert.equal(result.count, 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].userId, 'user-2')
  assert.equal(loggedErrors.length, 1)
  assert.equal(loggedErrors[0].message, 'FCM push delivery failed without failing notification job')
  assert.equal(loggedErrors[0].meta.requestId, 'request-123')
})
