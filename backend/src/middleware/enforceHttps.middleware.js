const isHttpsExemptRoute = (/** @type {{ method: string; path: string; }} */ req) => (
  (req.method === 'GET' && req.path === '/health') ||
  (req.method === 'GET' && req.path.startsWith('/api/docs'))
)

const isHttpsRequest = (/** @type {import('express').Request} */ req) => {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()

  return req.secure === true || forwardedProto === 'https'
}

const enforceHttps = (/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res, /** @type {import('express').NextFunction} */ next) => {
  if (process.env.NODE_ENV !== 'production' || isHttpsExemptRoute(req) || isHttpsRequest(req)) {
    return next()
  }

  // API clients should receive a deterministic JSON failure instead of a 301/308
  // that could replay unsafe methods or hide reverse-proxy HTTPS misconfiguration.
  return res.status(400).json({ message: 'HTTPS is required' })
}

module.exports = {
  enforceHttps,
  isHttpsExemptRoute,
  isHttpsRequest
}
