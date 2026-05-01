const isHttpsExemptRoute = (req) => (
  (req.method === 'GET' && req.path === '/health') ||
  (req.method === 'GET' && req.path.startsWith('/api/docs'))
)

const isHttpsRequest = (req) => {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()

  return req.secure === true || forwardedProto === 'https'
}

const enforceHttps = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || isHttpsExemptRoute(req) || isHttpsRequest(req)) {
    return next()
  }

  return res.status(400).json({ message: 'HTTPS is required' })
}

module.exports = {
  enforceHttps,
  isHttpsExemptRoute,
  isHttpsRequest
}
