const { PassThrough } = require('stream')

const createServiceError = (statusCode, message, details) => {
  const error = new Error(message)
  error.status = statusCode
  if (details !== undefined) {
    error.details = details
  }
  return error
}

const createServiceResponder = () => {
  const headers = {}
  const cookies = []
  const clears = []
  const stream = new PassThrough()
  let streamUsed = false
  let lastResult

  stream.header = (name, value) => {
    headers[name] = value
    return stream
  }

  stream.setCookie = (name, value, options) => {
    cookies.push([name, value, options])
    return stream
  }

  stream.expireCookie = (name, options) => {
    clears.push([name, options])
    return stream
  }

  stream.withStatus = (statusCode, body) => {
    lastResult = {
      statusCode,
      body,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  stream.ok = (body) => {
    lastResult = {
      body,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  stream.sendFile = (filePath, options) => {
    lastResult = {
      filePath,
      fileOptions: options,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  stream.internalError = (error) => {
    throw error
  }

  const originalWrite = stream.write.bind(stream)
  stream.write = (...args) => {
    streamUsed = true
    return originalWrite(...args)
  }

  const originalEnd = stream.end.bind(stream)
  stream.end = (...args) => {
    streamUsed = true
    return originalEnd(...args)
  }

  stream.toServiceResult = () => {
    if (lastResult) {
      return lastResult
    }

    if (!streamUsed && Object.keys(headers).length === 0 && cookies.length === 0 && clears.length === 0) {
      return undefined
    }

    return {
      headers,
      cookies,
      clears,
      stream
    }
  }

  return stream
}

module.exports = {
  createServiceError,
  createServiceResponder
}
