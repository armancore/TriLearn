const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const {
  clearStatsCache,
  readSharedStatsCache,
  writeSharedStatsCache
} = require('../utils/statsCache')

/**
 * Handles get admin stats business logic.
 * @param {any} context - Service context.
 * @returns {Promise<any>} Service result.
 */
const getAdminStats = async (context, result = createServiceResponder()) => {
    const sharedStats = await readSharedStatsCache()
  if (sharedStats) {
    return result.ok({ stats: sharedStats })
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

  await writeSharedStatsCache(stats)

  result.ok({ stats })
}

/**
 * Clears cached admin dashboard statistics.
 * @param {Record<string, any>} _context - Request context.
 * @param {import('../utils/serviceResult').ServiceResponder} [result] - Service result responder.
 * @returns {import('../utils/serviceResult').ServiceResult} Service result.
 */
const clearStatsCacheService = (_context, result = createServiceResponder()) => {
  clearStatsCache()
  return result.ok({ message: 'Stats cache cleared' })
}

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
} = require('./users.service')
const { importStudents } = require('./bulkImport.service')
const {
  getStudentApplications,
  getStudentApplication,
  reviewStudentApplication,
  updateStudentApplicationStatus,
  convertStudentApplication,
  createStudentFromApplication,
  deleteStudentApplication
} = require('./studentApplications.service')

module.exports = {
  clearStatsCache,
  clearStatsCacheService,
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
