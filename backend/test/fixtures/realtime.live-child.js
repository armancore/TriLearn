const { createServer } = require('node:http')
const { initRealtime, emitNotificationCreated, closeRealtime } = require('../../src/utils/realtime')
const { getReadyRedisClient } = require('../../src/utils/redis')
const prisma = require('../../src/utils/prisma')

const start = async () => {
  const server = createServer()
  await initRealtime({ server, allowedOrigins: ['http://localhost:5173'] })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.send({ ready: true, port: server.address().port })
  process.on('message', async message => {
    try {
      if (message.stop) {
        await closeRealtime()
        await prisma.$disconnect()
        const redis = await getReadyRedisClient()
        if (redis?.isOpen) await redis.quit()
        process.disconnect()
      } else {
        await emitNotificationCreated(message.userId, message.notification)
      }
    } catch (error) { process.send({ error: error.message }) }
  })
}
start().catch(error => { console.error(error); process.exit(1) })
