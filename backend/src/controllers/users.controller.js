const { createController } = require('../utils/controllerAdapter')
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

const getAllUsers = createController(getAllUsersService)
const getUserById = createController(getUserByIdService)
const createCoordinator = createController(createCoordinatorService)
const createGatekeeper = createController(createGatekeeperService)
const createInstructor = createController(createInstructorService)
const createStudent = createController(createStudentService)
const updateUser = createController(updateUserService)
const toggleUserStatus = createController(toggleUserStatusService)
const deleteUser = createController(deleteUserService)
const bulkAssignStudentSection = createController(bulkAssignStudentSectionService)
const promoteStudentSemester = createController(promoteStudentSemesterService)

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
