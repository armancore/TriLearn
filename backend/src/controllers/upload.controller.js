const { createController } = require('../utils/controllerAdapter')
const {
  serveUploadedFile: serveUploadedFileService
} = require('../services/upload.service')

const serveUploadedFile = createController(serveUploadedFileService)

module.exports = {
  serveUploadedFile: serveUploadedFile
}
