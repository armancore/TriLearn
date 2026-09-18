// Opt-in: disposable local PostgreSQL and Redis services only.
const test = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { once } = require('node:events')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const { io } = require('../../frontend/node_modules/socket.io-client')
for (const key of ['TEST_DATABASE_URL', 'TEST_REDIS_URL']) {
  assert.ok(process.env[key], `${key} is required`)
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(process.env[key]).hostname), `${key} must point to disposable local services`)
}
Object.assign(process.env, {
  NODE_ENV: 'development', DATABASE_URL: process.env.TEST_DATABASE_URL,
  DIRECT_URL: process.env.TEST_DATABASE_URL, REDIS_URL: process.env.TEST_REDIS_URL,
  JWT_ACCESS_SECRET: randomUUID() + randomUUID(), JWT_REFRESH_SECRET: randomUUID() + randomUUID(),
  CSRF_SECRET: randomUUID(), QR_SIGNING_SECRET: randomUUID(), LOGIN_CAPTCHA_SECRET: randomUUID(),
  FRONTEND_URL: 'http://localhost:5173', BCRYPT_ROUNDS: '4',
  RESEND_SMTP_PASS: '', FCM_SERVICE_ACCOUNT_JSON: '', SENTRY_DSN: '', DISABLE_RATE_LIMITS: 'false'
})
const prisma = require('../src/utils/prisma')
const { getReadyRedisClient } = require('../src/utils/redis')
const { revokeAccessToken } = require('../src/utils/accessTokenRevocation')
const { issueAuthSession } = require('../src/services/session.service')
const { changePassword } = require('../src/services/auth.account.service')
const { refreshMobile } = require('../src/services/auth.session.service')
const { createServiceResponder } = require('../src/utils/serviceResult')
const bcrypt = require('bcryptjs')
const { notificationQueue, CREATE_NOTIFICATIONS_JOB } = require('../src/jobs/notificationQueue')
const withTimeout = promise => Promise.race([promise, new Promise((_, reject) => {
  const timer = setTimeout(() => reject(new Error('Live test timed out')), 15000)
  timer.unref()
})])
const invoke = async (fn, context) => {
  const responder = createServiceResponder()
  return (await fn(context, responder)) || responder.toServiceResult()
}
const requestContext = { get: () => undefined, headers: {}, cookies: {}, ip: '127.0.0.1' }

test('real database and Redis enforce password revocation and cross-process socket authorization', { timeout: 60000 }, async () => {
  const children = [], sockets = []
  const user = await prisma.user.create({ data: { email: `review-${randomUUID()}@example.test`, name: 'Live Review', role: 'ADMIN', password: await bcrypt.hash('OldPassword!123', 4), emailVerified: true } })
  const redis = await getReadyRedisClient()
  try {
    const session = await issueAuthSession(user, createServiceResponder(), requestContext, undefined, { setRefreshCookie: false })
    for (let i = 0; i < 2; i++) {
      const child = fork(path.join(__dirname, 'fixtures/realtime.live-child.js'), [], { silent: true })
      children.push(child)
      child.stderr.on('data', chunk => process.stderr.write(chunk))
      const [ready] = await withTimeout(once(child, 'message'))
      assert.equal(ready.ready, true)
      const socket = io(`http://127.0.0.1:${ready.port}`, { path: '/api/v1/socket.io', auth: { token: session.accessToken }, extraHeaders: { Origin: 'http://localhost:5173' }, reconnection: false, transports: ['websocket'] })
      sockets.push(socket)
      await withTimeout(once(socket, 'connect'))
    }
    const worker = fork(path.join(__dirname, 'fixtures/worker.live-child.js'), [], { silent: true })
    children.push(worker)
    worker.stderr.on('data', chunk => process.stderr.write(chunk))
    const [workerReady] = await withTimeout(once(worker, 'message'))
    assert.equal(workerReady.ready, true)
    const queuedDelivery = sockets.map(socket => withTimeout(once(socket, 'notification:new')))
    await notificationQueue.add(CREATE_NOTIFICATIONS_JOB, { notifications: [{ userId: user.id, type: 'NOTICE_POSTED', title: 'Worker test', message: 'Isolated test', dedupeKey: randomUUID() }] })
    for (const [payload] of await Promise.all(queuedDelivery)) assert.equal(payload.notification.title, 'Worker test')
    const received = sockets.map(socket => withTimeout(once(socket, 'notification:new')))
    children[0].send({ userId: user.id, notification: { id: 'before-revocation' } })
    for (const [payload] of await Promise.all(received)) assert.equal(payload.notification.id, 'before-revocation')
    await revokeAccessToken(session.accessToken, { throwOnFailure: true })
    let leaked = 0
    sockets.forEach(socket => socket.on('notification:new', () => leaked++))
    const disconnected = sockets.map(socket => withTimeout(once(socket, 'disconnect')))
    children[0].send({ userId: user.id, notification: { id: 'after-revocation' } })
    await Promise.all(disconnected)
    assert.equal(leaked, 0)
    const rotations = await Promise.allSettled([0, 1].map(() => issueAuthSession(
      user, createServiceResponder(), requestContext, session.refreshToken, { setRefreshCookie: false }
    )))
    assert.equal(rotations.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(rotations.filter(result => result.status === 'rejected').length, 1)
    const second = await issueAuthSession(user, createServiceResponder(), requestContext, undefined, { setRefreshCookie: false })
    const changed = await invoke(changePassword, { ...requestContext, user, headers: { authorization: `Bearer ${second.accessToken}` }, body: { currentPassword: 'OldPassword!123', newPassword: 'NewPassword!456' } })
    assert.equal(changed.body.message, 'Password changed successfully!')
    assert.equal(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } }), 0)
    const refreshed = await invoke(refreshMobile, { ...requestContext, body: { refreshToken: second.refreshToken } })
    assert.equal(refreshed.statusCode, 401)
    await assert.rejects(issueAuthSession(user, createServiceResponder(), requestContext, undefined, { setRefreshCookie: false }), /Session is no longer valid/)
    const { verifySocketTokenUser } = require('../src/utils/realtime')
    const { signAccessToken } = require('../src/utils/token')
    // Preserve the pre-change iat to test the database cutoff independently of JTI revocation.
    const jwt = require('jsonwebtoken')
    const prior = jwt.decode(second.accessToken)
    const oldToken = jwt.sign({ ...jwt.decode(signAccessToken(user)), iat: prior.iat }, process.env.JWT_ACCESS_SECRET)
    await assert.rejects(verifySocketTokenUser(oldToken), /Password was changed/)
  } finally {
    sockets.forEach(socket => socket.close())
    await Promise.all(children.map(async child => {
      if (!child.connected) return
      const exit = once(child, 'exit')
      child.send({ stop: true })
      try { await withTimeout(exit) } finally { if (child.exitCode === null) child.kill() }
    }))
    await notificationQueue.close()
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
    if (redis?.isOpen) await redis.quit()
  }
})
