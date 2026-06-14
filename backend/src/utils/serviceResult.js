const { PassThrough } = require('stream')

/**
 * @typedef {object} ServiceResult
 * @property {number} [statusCode]
 * @property {unknown} [body]
 * @property {Record<string, string>} headers
 * @property {unknown[][]} cookies
 * @property {unknown[][]} clears
 * @property {string} [filePath]
 * @property {unknown} [fileOptions]
 * @property {string} [redirectUrl]
 * @property {PassThrough} [stream]
 */

/**
 * @typedef {object} ServiceResponderMethods
 * @property {(name: string, value: string) => ServiceResponder} header
 * @property {(name: string, value: unknown, options?: unknown) => ServiceResponder} setCookie
 * @property {(name: string, options?: unknown) => ServiceResponder} expireCookie
 * @property {(statusCode: number, body: unknown) => ServiceResult} withStatus
 * @property {(body: unknown) => ServiceResult} ok
 * @property {(filePath: string, options?: unknown) => ServiceResult} sendFile
 * @property {(url: string, statusCode?: number) => ServiceResult} redirect
 * @property {(error: Error) => never} internalError
 * @property {() => ServiceResult | undefined} toServiceResult
 */

/**
 * @typedef {PassThrough & ServiceResponderMethods} ServiceResponder
 */

/**
 * @param {number} statusCode
 * @param {string} message
 * @param {unknown} [details]
 * @returns {Error & { status: number, details?: unknown }}
 */
const createServiceError = (statusCode, message, details, code) => {
  const error = Object.assign(new Error(message), {
    status: statusCode,
    details,
    code
  })
  return error
}

/**
 * @returns {ServiceResponder}
 */
const createServiceResponder = () => {
  /** @type {Record<string, string>} */
  const headers = {}
  /** @type {unknown[][]} */
  const cookies = []
  /** @type {unknown[][]} */
  const clears = []
  /** @type {any} */
  const stream = new PassThrough()
  let streamUsed = false
  /** @type {ServiceResult | undefined} */
  let lastResult

  /** @type {any} */
  const responder = stream

  /** @type {(name: string, value: string) => ServiceResponder} */
  responder.header = (name, value) => {
    headers[name] = value
    return responder
  }

  /** @type {(name: string, value: unknown, options?: unknown) => ServiceResponder} */
  responder.setCookie = (name, value, options) => {
    cookies.push([name, value, options])
    return responder
  }

  /** @type {(name: string, options?: unknown) => ServiceResponder} */
  responder.expireCookie = (name, options) => {
    clears.push([name, options])
    return responder
  }

  /** @type {(statusCode: number, body: unknown) => ServiceResult} */
  responder.withStatus = (statusCode, body) => {
    lastResult = {
      statusCode,
      body,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  /** @type {(body: unknown) => ServiceResult} */
  responder.ok = (body) => {
    lastResult = {
      body,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  /** @type {(filePath: string, options?: unknown) => ServiceResult} */
  responder.sendFile = (filePath, options) => {
    lastResult = {
      filePath,
      fileOptions: options,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  /** @type {(url: string, statusCode?: number) => ServiceResult} */
  responder.redirect = (url, statusCode = 302) => {
    lastResult = {
      redirectUrl: url,
      statusCode,
      headers,
      cookies,
      clears
    }
    return lastResult
  }

  /** @type {(error: Error) => never} */
  responder.internalError = (error) => {
    throw error
  }

  const originalWrite = responder.write.bind(responder)
  /** @type {(...args: any[]) => boolean} */
  responder.write = (...args) => {
    streamUsed = true
    return originalWrite(...args)
  }

  const originalEnd = responder.end.bind(responder)
  /** @type {(...args: any[]) => ServiceResponder} */
  responder.end = (...args) => {
    streamUsed = true
    return originalEnd(...args)
  }

  /** @type {() => ServiceResult | undefined} */
  responder.toServiceResult = () => {
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
      stream: responder
    }
  }

  return responder
}

module.exports = {
  createServiceError,
  createServiceResponder
}
