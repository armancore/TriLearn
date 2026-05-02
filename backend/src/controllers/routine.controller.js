delete require.cache[require.resolve('../services/routine.service')]
const {
  createRoutine: createRoutineService,
  getAllRoutines: getAllRoutinesService,
  getRoutineById: getRoutineByIdService,
  updateRoutine: updateRoutineService,
  deleteRoutine: deleteRoutineService
} = require('../services/routine.service')

const createRoutine = async (req, res) => {
  return createRoutineService(req, res)
}

const getAllRoutines = async (req, res) => {
  return getAllRoutinesService(req, res)
}

const getRoutineById = async (req, res) => {
  return getRoutineByIdService(req, res)
}

const updateRoutine = async (req, res) => {
  return updateRoutineService(req, res)
}

const deleteRoutine = async (req, res) => {
  return deleteRoutineService(req, res)
}
module.exports = {
  createRoutine: createRoutine,
  getAllRoutines: getAllRoutines,
  getRoutineById: getRoutineById,
  updateRoutine: updateRoutine,
  deleteRoutine: deleteRoutine
}
