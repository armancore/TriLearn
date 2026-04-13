const fs = require('fs')
const path = require('path')

const uploadPath = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads')

const uploadPublicPath = process.env.UPLOAD_PUBLIC_PATH || '/api/v1/uploads'
const uploadBaseUrl = (process.env.UPLOAD_BASE_URL || '').trim().replace(/\/$/, '')

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true })
}

const buildUploadedFileUrl = (file) => {
  if (!file?.filename) return undefined

  const relativePath = `${uploadPublicPath}/${file.filename}`
  return uploadBaseUrl ? `${uploadBaseUrl}${relativePath}` : relativePath
}

module.exports = {
  uploadPath,
  uploadPublicPath,
  buildUploadedFileUrl
}
