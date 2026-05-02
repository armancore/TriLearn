delete require.cache[require.resolve('../../services/attendance/shared.service')]
const attendanceService = require('../../services/attendance/shared.service')

module.exports = attendanceService
