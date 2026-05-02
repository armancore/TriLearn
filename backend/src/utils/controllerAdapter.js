const buildServiceContext = (request) => ({
  body: request.body || {},
  params: request.params || {},
  query: request.query || {},
  user: request.user || null,
  student: request.student || null,
  instructor: request.instructor || null,
  coordinator: request.coordinator || null,
  gatekeeper: request.gatekeeper || null,
  file: request.file || null,
  files: request.files || null,
  cookies: request.cookies || {},
  headers: request.headers || {},
  ip: request.ip || null,
  socket: {
    remoteAddress: request.socket?.remoteAddress || null
  },
  accessTokenPayload: request.accessTokenPayload || null,
  get: (name) => request.get(name)
})

const applyServiceResult = (response, result) => {
  if (!result) {
    return typeof response.end === 'function' ? response.end() : response
  }

  Object.entries(result.headers || {}).forEach(([name, value]) => {
    response.setHeader(name, value)
  })

  ;(result.cookies || []).forEach(([name, value, options]) => {
    response.cookie(name, value, options)
  })

  ;(result.clears || []).forEach(([name, options]) => {
    response.clearCookie(name, options)
  })

  if (result.stream) {
    if (typeof response.on !== 'function' || typeof response.write !== 'function') {
      result.stream.on('data', () => {})
      return response
    }

    return result.stream.pipe(response)
  }

  if (result.filePath) {
    return response.sendFile(result.filePath, result.fileOptions)
  }

  if (result.statusCode) {
    response.status(result.statusCode)
  }

  return response.json(result.body !== undefined ? result.body : result)
}

const handleControllerError = (response, error, fallbackMessage) => {
  if (error?.status) {
    const payload = { message: error.message }
    if (error.details !== undefined) {
      payload.details = error.details
    }
    return response.status(error.status).json(payload)
  }

  return response.internalError
    ? response.internalError(error, fallbackMessage)
    : response.status(500).json({ message: fallbackMessage || 'Something went wrong' })
}

const createController = (serviceFn, options = {}) => async (request, response) => {
  try {
    const serviceResponder = createServiceResponder()
    const result = await serviceFn(buildServiceContext(request), serviceResponder)
    return applyServiceResult(response, result || serviceResponder.toServiceResult())
  } catch (error) {
    return handleControllerError(response, error, options.fallbackMessage)
  }
}

module.exports = {
  applyServiceResult,
  buildServiceContext,
  createController,
  handleControllerError
}
const { createServiceResponder } = require('./serviceResult')
