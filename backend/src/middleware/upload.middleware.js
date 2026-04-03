const fs = require('fs')
const path = require('path')
const multer = require('multer')
const logger = require('../utils/logger')
const { uploadPath } = require('../utils/fileStorage')

const DEFAULT_ROLE_LIMITS = {
  ADMIN: 15 * 1024 * 1024,
  COORDINATOR: 15 * 1024 * 1024,
  INSTRUCTOR: 15 * 1024 * 1024,
  STUDENT: 10 * 1024 * 1024
}

const parseUploadLimit = (envKey, fallback) => {
  const rawValue = process.env[envKey]
  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

const getUploadLimitForRole = (role) => {
  const resolvedRole = role || 'STUDENT'
  const fallbackLimit = DEFAULT_ROLE_LIMITS[resolvedRole] || DEFAULT_ROLE_LIMITS.STUDENT
  return parseUploadLimit(`MAX_PDF_UPLOAD_BYTES_${resolvedRole}`, fallbackLimit)
}

const formatBytesInMb = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadPath)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  }
})

const pdfOnly = (_req, file, cb) => {
  const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')

  if (!isPdf) {
    return cb(new Error('Only PDF files are allowed'))
  }

  cb(null, true)
}

const imageOnly = (_req, file, cb) => {
  const mimeType = String(file.mimetype || '').toLowerCase()
  const fileName = String(file.originalname || '').toLowerCase()
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName)

  if (!isImage) {
    return cb(new Error('Only image files are allowed'))
  }

  cb(null, true)
}

const createUploadMiddleware = (role) => multer({
  storage,
  fileFilter: pdfOnly,
  limits: {
    fileSize: getUploadLimitForRole(role)
  }
})

const createImageUploadMiddleware = (maxBytes = 3 * 1024 * 1024) => multer({
  storage,
  fileFilter: imageOnly,
  limits: {
    fileSize: maxBytes
  }
})

const uploadPdf = {
  single: (fieldName) => (req, res, next) => {
    const uploadLimit = getUploadLimitForRole(req.user?.role)

    createUploadMiddleware(req.user?.role).single(fieldName)(req, res, (error) => {
      if (!error) {
        return next()
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: `Uploaded PDF exceeds the ${formatBytesInMb(uploadLimit)} limit for ${String(req.user?.role || 'STUDENT').toLowerCase()} uploads`
        })
      }

      if (error instanceof Error) {
        return res.status(400).json({ message: error.message || 'Unable to upload PDF' })
      }

      next(error)
    })
  }
}

const uploadImage = {
  single: (fieldName, { maxBytes = 3 * 1024 * 1024 } = {}) => (req, res, next) => {
    createImageUploadMiddleware(maxBytes).single(fieldName)(req, res, (error) => {
      if (!error) {
        return next()
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: `Uploaded image exceeds the ${formatBytesInMb(maxBytes)} limit`
        })
      }

      if (error instanceof Error) {
        return res.status(400).json({ message: error.message || 'Unable to upload image' })
      }

      next(error)
    })
  }
}

const validateUploadedPdf = async (req, res, next) => {
  if (!req.file?.path) {
    return next()
  }

  try {
    const fileHandle = await fs.promises.open(req.file.path, 'r')
    const signatureBuffer = Buffer.alloc(5)
    await fileHandle.read(signatureBuffer, 0, 5, 0)
    await fileHandle.close()

    if (signatureBuffer.toString() !== '%PDF-') {
      await fs.promises.unlink(req.file.path).catch(() => {})
      return res.status(400).json({ message: 'Uploaded file content is not a valid PDF' })
    }

    next()
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    await fs.promises.unlink(req.file.path).catch(() => {})
    res.status(400).json({ message: 'Unable to validate uploaded file' })
  }
}

const validateUploadedImage = async (req, res, next) => {
  if (!req.file?.path) {
    return next()
  }

  try {
    const fileHandle = await fs.promises.open(req.file.path, 'r')
    const signatureBuffer = Buffer.alloc(12)
    await fileHandle.read(signatureBuffer, 0, 12, 0)
    await fileHandle.close()

    const header = signatureBuffer.toString('hex')
    const isPng = header.startsWith('89504e470d0a1a0a')
    const isJpeg = header.startsWith('ffd8ff')
    const isGif = signatureBuffer.toString('ascii', 0, 6) === 'GIF87a' || signatureBuffer.toString('ascii', 0, 6) === 'GIF89a'
    const isWebp = signatureBuffer.toString('ascii', 0, 4) === 'RIFF' && signatureBuffer.toString('ascii', 8, 12) === 'WEBP'

    if (!isPng && !isJpeg && !isGif && !isWebp) {
      await fs.promises.unlink(req.file.path).catch(() => {})
      return res.status(400).json({ message: 'Uploaded file content is not a valid image' })
    }

    next()
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    await fs.promises.unlink(req.file.path).catch(() => {})
    res.status(400).json({ message: 'Unable to validate uploaded image' })
  }
}

const removeUploadedFile = async (fileUrl) => {
  if (!fileUrl) return

  try {
    const fileName = path.basename(String(fileUrl))
    if (!fileName) return
    await fs.promises.unlink(path.join(uploadPath, fileName)).catch(() => {})
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
  }
}

module.exports = { uploadPdf, uploadImage, uploadPath, validateUploadedPdf, validateUploadedImage, removeUploadedFile }
