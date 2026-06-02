const prisma = require('../../utils/prisma')
const { recordAuditLog } = require('../../utils/audit')
const timeHelpers = require('./time.helpers')
const subjectHelpers = require('./subject.helpers')
const gateWindowService = require('./gate-window.service')
const qrPayloadHelpers = require('./qr-payload.helpers')
const studentLookupService = require('./student-lookup.service')
const attendanceWriteService = require('./attendance-write.service')
const reportPayloadService = require('./report-payload.service')

module.exports = {
  ...subjectHelpers,
  prisma,
  ...timeHelpers,
  ...gateWindowService,
  ...qrPayloadHelpers,
  ...studentLookupService,
  ...attendanceWriteService,
  ...reportPayloadService,
  recordAuditLog
}
