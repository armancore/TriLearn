const { errorInfo } = require('./errorInfo')
const { createErrorResponse, ERROR_CODES, normalizeErrorCode } = require('./apiError')
const { createServiceResponder } = require('./serviceResult')

/** @param {import('express').Request['params']} params */
const scalarRouteParams = (params) => Object.fromEntries(Object.entries(params || {}).map(([key, value]) => {
  if (typeof value !== 'string') throw Object.assign(new Error('Invalid route parameter'), { status: 400 })
  return [key, value]
}))

/** @param {import('express').Request} request */
const buildServiceContext = (request) => ({
  body: request.body || {},
  originalUrl: request.originalUrl,
  params: scalarRouteParams(request.params),
  query: request.validatedQuery ?? request.query ?? {},
  user: request.user || null,
  student: request.student || null,
  instructor: request.instructor || null,
  coordinator: request.coordinator || null,
  gatekeeper: request.gatekeeper || null,
  file: request.file || null,
  files: request.files || null,
  cookies: request.cookies || {},
  headers: request.headers || {},
  requestId: request.id || null,
  ip: request.ip || null,
  socket: {
    remoteAddress: request.socket?.remoteAddress || null
  },
  accessTokenPayload: request.accessTokenPayload || null,
  get: (/** @type {string} */ name) => request.get(name)
})

/** @param {import('express').Response} response @param {import('./serviceResult').ServiceResult | undefined} result */
const applyServiceResult = (response, result) => {
  if (!result) {
    return typeof response.end === 'function' ? response.end() : response
  }

  Object.entries(result.headers || {}).forEach(([name, value]) => {
    response.setHeader(name, value)
  })

  ;(result.cookies || []).forEach(([name, value, options]) => {
    response.cookie(name, value, options || {})
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
    return response.sendFile(result.filePath, result.fileOptions || {})
  }

  if (result.redirectUrl) {
    return response.redirect(result.statusCode || 302, result.redirectUrl)
  }

  if (result.statusCode) {
    response.status(result.statusCode)
  }

  return response.json(result.body !== undefined ? result.body : result)
}

/** @param {import('express').Response} response @param {unknown} error @param {string} [fallbackMessage] */
const handleControllerError = (response, error, fallbackMessage) => {
  const info = errorInfo(error)
  if (info.code === 'P2024') {
    response.setHeader('Retry-After', '5')
    return response.status(503).json(createErrorResponse({
      code: ERROR_CODES.DATABASE_BUSY,
      message: 'Database is busy. Please try again shortly.'
    }))
  }

  if (info.status) {
    const payload = createErrorResponse({
      code: normalizeErrorCode(info.code),
      message: info.message
    })
    if (info.details !== undefined) {
      payload.details = info.details
    }
    return response.status(info.status).json(payload)
  }

  return response.internalError
    ? response.internalError(error, fallbackMessage)
    : response.status(500).json(createErrorResponse({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: fallbackMessage || 'Something went wrong'
    }))
}

/**
 * @param {(context: ReturnType<typeof buildServiceContext>, result: import('./serviceResult').ServiceResponder) => Promise<import('./serviceResult').ServiceResult | void> | import('./serviceResult').ServiceResult | void} serviceFn
 * @param {{ fallbackMessage?: string }} [options]
 * @returns {import('express').RequestHandler}
 */
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
