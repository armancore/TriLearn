const { createController } = require('../utils/controllerAdapter')
const {
  createDisciplinaryRecord: createDisciplinaryRecordService,
  updateDisciplinaryRecord: updateDisciplinaryRecordService,
  deleteDisciplinaryRecord: deleteDisciplinaryRecordService
} = require('../services/disciplinary.service')

const createDisciplinaryRecord = createController(createDisciplinaryRecordService)
const updateDisciplinaryRecord = createController(updateDisciplinaryRecordService)
const deleteDisciplinaryRecord = createController(deleteDisciplinaryRecordService)

module.exports = { createDisciplinaryRecord, updateDisciplinaryRecord, deleteDisciplinaryRecord }
