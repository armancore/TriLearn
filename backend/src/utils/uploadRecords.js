const path = require('path')
const prisma = require('./prisma')

const attachUploadedFileToEntity = async (/** @type {{filename?: string} | null | undefined} */ file, /** @type {string} */ entityType, /** @type {string} */ entityId) => {
  if (!file?.filename || !entityType || !entityId || !prisma.uploadedFile?.updateMany) {
    return
  }

  await prisma.uploadedFile.updateMany({
    where: { fileName: path.basename(String(file.filename)) },
    data: {
      entityType,
      entityId
    }
  })
}

module.exports = {
  attachUploadedFileToEntity
}
