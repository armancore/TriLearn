delete require.cache[require.resolve('../services/bulkImport.service')]
const {
  importStudents: importStudentsService
} = require('../services/bulkImport.service')

const importStudents = async (req, res) => {
  return importStudentsService(req, res)
}
module.exports = {
  importStudents: importStudents
}
