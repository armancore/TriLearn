const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const { getReadyRedisClient } = require('../utils/redis')

const STATS_CACHE_TTL = 30 * 1000 // 30 seconds
const STATS_CACHE_KEY = 'admin:stats:v1'
const ADMIN_STATS_FIELDS = [
  'totalUsers',
  'totalStudents',
  'totalInstructors',
  'totalCoordinators',
  'totalGatekeepers',
  'totalSubjects'
]
let statsCache = null
let statsCacheExpiresAt = 0

const normalizeCachedAdminStats = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const normalized = {}
  for (const field of ADMIN_STATS_FIELDS) {
    const fieldValue = value[field]
    if (!Number.isSafeInteger(fieldValue) || fieldValue < 0) {
      return null
    }
    normalized[field] = fieldValue
  }

  return normalized
}

const readSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return null
    }

    const cachedValue = await client.get(STATS_CACHE_KEY)
    if (!cachedValue) {
      return null
    }

    const parsedCache = JSON.parse(cachedValue)
    const normalizedStats = normalizeCachedAdminStats(parsedCache)
    if (!normalizedStats) {
      logger.warn('Ignoring invalid admin stats cache payload from Redis')
      return null
    }

    return normalizedStats
  } catch (error) {
    logger.warn('Failed to read admin stats cache from Redis', { message: error.message })
    return null
  }
}

const writeSharedStatsCache = async (stats) => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.set(STATS_CACHE_KEY, JSON.stringify(stats), { PX: STATS_CACHE_TTL })
  } catch (error) {
    logger.warn('Failed to write admin stats cache to Redis', { message: error.message })
  }
}

const clearSharedStatsCache = async () => {
  try {
    const client = await getReadyRedisClient({ context: 'admin stats cache' })
    if (!client) {
      return
    }

    await client.del(STATS_CACHE_KEY)
  } catch (error) {
    logger.warn('Failed to clear admin stats cache in Redis', { message: error.message })
  }
}

const clearStatsCache = () => {
  statsCache = null
  statsCacheExpiresAt = 0
  void clearSharedStatsCache()
}

const getAdminStats = async (req, res) => {
  try {
    if (statsCache && Date.now() < statsCacheExpiresAt) {
      return res.json({ stats: statsCache })
    }

    const sharedStats = await readSharedStatsCache()
    if (sharedStats) {
      statsCache = sharedStats
      statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL
      return res.json({ stats: sharedStats })
    }

    const [totalUsers, totalStudents, totalInstructors, totalCoordinators, totalGatekeepers, totalSubjects] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { role: 'STUDENT', deletedAt: null } }),
      prisma.user.count({ where: { role: 'INSTRUCTOR', deletedAt: null } }),
      prisma.user.count({ where: { role: 'COORDINATOR', deletedAt: null } }),
      prisma.user.count({ where: { role: 'GATEKEEPER', deletedAt: null } }),
      prisma.subject.count()
    ])

    const stats = {
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCoordinators,
      totalGatekeepers,
      totalSubjects
    }

    statsCache = stats
    statsCacheExpiresAt = Date.now() + STATS_CACHE_TTL
    await writeSharedStatsCache(stats)

    res.json({ stats })
  } catch (error) {
    res.internalError(error)
  }
}

delete require.cache[require.resolve('./users.controller')]
delete require.cache[require.resolve('./bulkImport.controller')]
delete require.cache[require.resolve('./studentApplications.controller')]
const {
  getAllUsers,
  getUsers,
  getUserById,
  createCoordinator,
  createGatekeeper,
  createInstructor,
  createStudent,
  createUser,
  updateUser,
  toggleUserStatus,
  suspendUser,
  unsuspendUser,
  deleteUser,
  bulkAssignStudentSection,
  promoteStudentSemester
} = require('./users.controller')
const { importStudents } = require('./bulkImport.controller')
const {
  getStudentApplications,
  getStudentApplication,
  reviewStudentApplication,
  updateStudentApplicationStatus,
  convertStudentApplication,
  createStudentFromApplication,
  deleteStudentApplication
} = require('./studentApplications.controller')

module.exports = {
  clearStatsCache,
  getAdminStats,
  getAllUsers,
  getUsers,
  getUserById,
  getStudentApplications,
  getStudentApplication,
  reviewStudentApplication,
  updateStudentApplicationStatus,
  convertStudentApplication,
  createStudentFromApplication,
  deleteStudentApplication,
  createGatekeeper,
  createCoordinator,
  createInstructor,
  createStudent,
  createUser,
  importStudents,
  updateUser,
  bulkAssignStudentSection,
  promoteStudentSemester,
  toggleUserStatus,
  suspendUser,
  unsuspendUser,
  deleteUser
}
