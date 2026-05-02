const prisma = require('../utils/prisma')
const {
  clearStatsCache,
  readSharedStatsCache,
  writeSharedStatsCache
} = require('../utils/statsCache')

const getAdminStats = async (req, res) => {
  try {
    const sharedStats = await readSharedStatsCache()
    if (sharedStats) {
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

    await writeSharedStatsCache(stats)

    res.json({ stats })
  } catch (error) {
    res.internalError(error)
  }
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
