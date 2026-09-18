const { start } = require('../../src/worker')
process.on('message', message => {
  if (message.stop) {
    process.emit('SIGTERM')
    process.disconnect()
  }
})
start().then(() => process.send({ ready: true })).catch(error => { console.error(error); process.exit(1) })
