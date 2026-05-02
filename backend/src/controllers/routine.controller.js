const { createController } = require('../utils/controllerAdapter')
const {
  createRoutine: createRoutineService,
  getAllRoutines: getAllRoutinesService,
  getRoutineById: getRoutineByIdService,
  updateRoutine: updateRoutineService,
  deleteRoutine: deleteRoutineService
} = require('../services/routine.service')

const createRoutine = createController(createRoutineService)
const getAllRoutines = createController(getAllRoutinesService)
const getRoutineById = createController(getRoutineByIdService)
const updateRoutine = createController(updateRoutineService)
const deleteRoutine = createController(deleteRoutineService)

module.exports = {
  createRoutine: createRoutine,
  getAllRoutines: getAllRoutines,
  getRoutineById: getRoutineById,
  updateRoutine: updateRoutine,
  deleteRoutine: deleteRoutine
}
