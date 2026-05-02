delete require.cache[require.resolve('../services/upload.service')]
const {
  serveUploadedFile: serveUploadedFileService
} = require('../services/upload.service')

const serveUploadedFile = async (req, res) => {
  return serveUploadedFileService(req, res)
}
module.exports = {
  serveUploadedFile: serveUploadedFile
}
