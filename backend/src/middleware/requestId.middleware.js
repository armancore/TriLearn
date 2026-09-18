const { randomUUID } = require('crypto')

const requestId = (/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res, /** @type {import('express').NextFunction} */ next) => {
  req.id = randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
}

module.exports = {
  requestId
}
