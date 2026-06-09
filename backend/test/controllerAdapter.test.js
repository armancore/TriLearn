const test = require('node:test')
const assert = require('node:assert/strict')

const { handleControllerError } = require('../src/utils/controllerAdapter')

const createResponse = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) {
    this.statusCode = code
    return this
  },
  json(payload) {
    this.body = payload
    return this
  },
  setHeader(name, value) {
    this.headers[name] = value
    return this
  }
})

test('handleControllerError maps Prisma P2024 pool timeouts to 503 with Retry-After', () => {
  const res = createResponse()
  const error = Object.assign(new Error('Timed out fetching a new connection from the connection pool'), {
    code: 'P2024'
  })

  handleControllerError(res, error, 'Something went wrong')

  assert.equal(res.statusCode, 503)
  assert.equal(res.headers['Retry-After'], '5')
  assert.deepEqual(res.body, {
    message: 'Database is busy. Please try again shortly.'
  })
})
