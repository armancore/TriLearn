const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

const parseSemverCore = (version) => {
  const [core] = String(version || '').split(/[-+]/)
  const parts = core.split('.').map((part) => Number.parseInt(part, 10))

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null
  }

  return parts
}

const compareSemver = (left, right) => {
  const leftParts = parseSemverCore(left)
  const rightParts = parseSemverCore(right)

  if (!leftParts || !rightParts) {
    return null
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }

  return 0
}

const getMinimumMobileVersion = () => String(process.env.MIN_MOBILE_VERSION || '').trim()

const hasValidMobileClientHeaders = (req) => {
  const clientType = String(req.get('x-client-type') || '').trim().toLowerCase()
  const appVersion = String(req.get('x-app-version') || '').trim()

  return clientType === 'mobile' && SEMVER_PATTERN.test(appVersion)
}

const validateMobileClient = (req, res, next) => {
  const clientType = String(req.get('x-client-type') || '').trim().toLowerCase()
  const appVersion = String(req.get('x-app-version') || '').trim()

  if (clientType !== 'mobile' || !SEMVER_PATTERN.test(appVersion)) {
    return res.status(400).json({ message: 'Missing mobile client headers.' })
  }

  req.mobileAppVersion = appVersion
  if (req.logger && typeof req.logger.child === 'function') {
    req.logger = req.logger.child({ mobileAppVersion: appVersion })
  }

  const minVersion = getMinimumMobileVersion()
  if (minVersion) {
    const versionComparison = compareSemver(appVersion, minVersion)
    if (versionComparison === null || versionComparison < 0) {
      return res.status(426).json({
        message: 'Please update the TriLearn app',
        minVersion
      })
    }
  }

  return next()
}

module.exports = {
  SEMVER_PATTERN,
  compareSemver,
  hasValidMobileClientHeaders,
  validateMobileClient
}
