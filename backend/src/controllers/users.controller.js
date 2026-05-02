delete require.cache[require.resolve('../services/users.service')]
const {
  getAllUsers: getAllUsersService,
  getUserById: getUserByIdService,
  createCoordinator: createCoordinatorService,
  createGatekeeper: createGatekeeperService,
  createInstructor: createInstructorService,
  createStudent: createStudentService,
  updateUser: updateUserService,
  toggleUserStatus: toggleUserStatusService,
  deleteUser: deleteUserService,
  bulkAssignStudentSection: bulkAssignStudentSectionService,
  promoteStudentSemester: promoteStudentSemesterService
} = require('../services/users.service')

const getAllUsers = async (req, res) => {
  return getAllUsersService(req, res)
}

const getUserById = async (req, res) => {
  return getUserByIdService(req, res)
}

const createCoordinator = async (req, res) => {
  return createCoordinatorService(req, res)
}

const createGatekeeper = async (req, res) => {
  return createGatekeeperService(req, res)
}

const createInstructor = async (req, res) => {
  return createInstructorService(req, res)
}

const createStudent = async (req, res) => {
  return createStudentService(req, res)
}

const updateUser = async (req, res) => {
  return updateUserService(req, res)
}

const toggleUserStatus = async (req, res) => {
  return toggleUserStatusService(req, res)
}

const deleteUser = async (req, res) => {
  return deleteUserService(req, res)
}

const bulkAssignStudentSection = async (req, res) => {
  return bulkAssignStudentSectionService(req, res)
}

const promoteStudentSemester = async (req, res) => {
  return promoteStudentSemesterService(req, res)
}
module.exports = {
  getAllUsers: getAllUsers,
  getUsers: getAllUsers,
  getUserById: getUserById,
  createCoordinator: createCoordinator,
  createGatekeeper: createGatekeeper,
  createInstructor: createInstructor,
  createStudent: createStudent,
  createUser: createStudent,
  updateUser: updateUser,
  toggleUserStatus: toggleUserStatus,
  suspendUser: toggleUserStatus,
  unsuspendUser: toggleUserStatus,
  deleteUser: deleteUser,
  bulkAssignStudentSection: bulkAssignStudentSection,
  promoteStudentSemester: promoteStudentSemester
}
