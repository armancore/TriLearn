const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { TextDecoder } = require('util')
const multer = require('multer')
const sharp = require('sharp')
const { fileTypeFromBuffer } = require('file-type')
const { PDFDocument } = require('pdf-lib')
const logger = require('../utils/logger')
const fileStorage = require('../utils/fileStorage')

const {
  uploadPath,
  uploadFile,
  deleteFile
} = fileStorage
const isS3Configured = fileStorage.isS3Configured || (() => false)

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
const sanitizeUploadedOriginalName = (originalname, fallback = 'upload.pdf') => {
  const normalized = String(originalname || fallback).replace(/\\/g, '/')
  const baseName = normalized.split('/').pop() || fallback
  const safeName = baseName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return safeName || fallback
}

const generateUploadedFileName = (originalname) => {
  const safeName = sanitizeUploadedOriginalName(originalname)
  return `${crypto.randomUUID()}-${safeName}`
}

const storeValidatedUpload = async (buffer, fileName, mimeType) => {
  const localPath = path.join(uploadPath, fileName)
  if (typeof uploadFile !== 'function') {
    await fs.promises.writeFile(localPath, buffer)
    return { path: localPath, url: localPath }
  }

  const storedFile = await uploadFile(buffer, fileName, mimeType)
  return {
    path: isS3Configured() ? storedFile.url : localPath,
    url: storedFile.url
  }
}

const pdfOnly = (_req, file, cb) => {
  file.originalname = sanitizeUploadedOriginalName(file.originalname)
  const isPdf = String(file.mimetype || '').toLowerCase() === 'application/pdf'

  if (!isPdf) {
    return cb(new Error('Only PDF files are allowed'))
  }

  cb(null, true)
}

const spreadsheetOnly = (_req, file, cb) => {
  file.originalname = sanitizeUploadedOriginalName(file.originalname, 'upload.csv')
  const mimeType = String(file.mimetype || '').toLowerCase()
  const fileName = String(file.originalname || '').toLowerCase()
  const isSpreadsheet = (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.xlsx')
  )

  if (!isSpreadsheet) {
    return cb(new Error('Only CSV or XLSX files are allowed'))
  }

  cb(null, true)
}

const imageOnly = (_req, file, cb) => {
  file.originalname = sanitizeUploadedOriginalName(file.originalname, 'upload-image')
  const mimeType = String(file.mimetype || '').toLowerCase()
  const isImage = mimeType.startsWith('image/')

  if (!isImage) {
    return cb(new Error('Only image files are allowed'))
  }

  cb(null, true)
}

const getImageSignatureFlags = (buffer) => {
  const signatureBuffer = Buffer.from(buffer || []).subarray(0, 12)
  const header = signatureBuffer.toString('hex')

  return {
    isPng: header.startsWith('89504e470d0a1a0a'),
    isJpeg: header.startsWith('ffd8ff'),
    isGif: signatureBuffer.toString('ascii', 0, 6) === 'GIF87a' || signatureBuffer.toString('ascii', 0, 6) === 'GIF89a',
    isWebp: signatureBuffer.toString('ascii', 0, 4) === 'RIFF' && signatureBuffer.toString('ascii', 8, 12) === 'WEBP'
  }
}

const createUploadMiddleware = (role) => multer({
  storage: multer.memoryStorage(),
  fileFilter: pdfOnly,
  limits: {
    fileSize: getUploadLimitForRole(role)
  }
})

const createImageUploadMiddleware = (maxBytes = 3 * 1024 * 1024) => multer({
  storage: multer.memoryStorage(),
  fileFilter: imageOnly,
  limits: {
    fileSize: maxBytes
  }
})

const createSpreadsheetUploadMiddleware = (maxBytes = 5 * 1024 * 1024) => multer({
  storage: multer.memoryStorage(),
  fileFilter: spreadsheetOnly,
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

const uploadSpreadsheet = {
  single: (fieldName, { maxBytes = 5 * 1024 * 1024 } = {}) => (req, res, next) => {
    createSpreadsheetUploadMiddleware(maxBytes).single(fieldName)(req, res, (error) => {
      if (!error) {
        return next()
      }

      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: `Uploaded spreadsheet exceeds the ${formatBytesInMb(maxBytes)} limit`
        })
      }

      if (error instanceof Error) {
        return res.status(400).json({ message: error.message || 'Unable to upload spreadsheet' })
      }

      next(error)
    })
  }
}

const validateUploadedPdf = async (req, res, next) => {
  if (!req.file?.buffer) {
    return next()
  }

  try {
    req.file.originalname = sanitizeUploadedOriginalName(req.file.originalname)
    const signatureBuffer = req.file.buffer.subarray(0, 5)

    if (signatureBuffer.toString() !== '%PDF-') {
      return res.status(400).json({ message: 'Uploaded file content is not a valid PDF' })
    }

    await PDFDocument.load(req.file.buffer)

    const fileName = generateUploadedFileName(req.file.originalname)
    const storedFile = await storeValidatedUpload(req.file.buffer, fileName, req.file.mimetype)

    req.file.filename = fileName
    req.file.path = storedFile.path
    req.file.url = storedFile.url

    next()
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    res.status(400).json({ message: 'Unable to validate uploaded file' })
  }
}

const validateUploadedImage = async (req, res, next) => {
  if (!req.file?.buffer) {
    return next()
  }

  try {
    req.file.originalname = sanitizeUploadedOriginalName(req.file.originalname, 'upload-image')
    const { isPng, isJpeg, isGif, isWebp } = getImageSignatureFlags(req.file.buffer)

    if (!isPng && !isJpeg && !isGif && !isWebp) {
      return res.status(400).json({ message: 'Uploaded file content is not a valid image' })
    }

    const fileName = generateUploadedFileName(req.file.originalname)
    let processedBuffer

    try {
      const processor = sharp(req.file.buffer).rotate()
      if (typeof uploadFile === 'function') {
        processedBuffer = await processor.toBuffer()
      } else {
        await processor.toFile(path.join(uploadPath, fileName))
      }
    } catch (sharpError) {
      logger.error(sharpError.message, { stack: sharpError.stack })
      return res.status(400).json({ message: 'Could not process uploaded image' })
    }

    const storedFile = typeof uploadFile === 'function'
      ? await storeValidatedUpload(processedBuffer, fileName, req.file.mimetype)
      : { path: path.join(uploadPath, fileName), url: path.join(uploadPath, fileName) }

    req.file.filename = fileName
    req.file.path = storedFile.path
    req.file.url = storedFile.url

    next()
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    if (req.file?.path) {
      await deleteFile(req.file.path).catch(() => {})
    }
    res.status(400).json({ message: 'Unable to validate uploaded image' })
  }
}

const SPREADSHEET_MIME_ALLOWLIST = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
])

const hasLegacyXlsSignature = (buffer) => (
  Buffer.from(buffer || []).subarray(0, 8).toString('hex').toLowerCase() === 'd0cf11e0a1b11ae1'
)

const csvUtf8Decoder = new TextDecoder('utf-8', { fatal: true })
const isUtf8TextBuffer = (buffer) => {
  try {
    csvUtf8Decoder.decode(buffer)
    return true
  } catch {
    return false
  }
}

const isLikelyCsvUpload = (file, detectedType) => {
  if (detectedType) {
    return false
  }

  const mimeType = String(file?.mimetype || '').toLowerCase()
  const fileName = String(file?.originalname || '').toLowerCase()
  const declaredAsCsv = mimeType === 'text/csv' || mimeType === 'application/csv' || fileName.endsWith('.csv')

  if (!declaredAsCsv) {
    return false
  }

  const content = Buffer.from(file?.buffer || [])
  if (content.includes(0)) {
    return false
  }

  return isUtf8TextBuffer(content)
}

const validateUploadedSpreadsheet = async (req, res, next) => {
  if (!req.file?.buffer) {
    return next()
  }

  try {
    req.file.originalname = sanitizeUploadedOriginalName(req.file.originalname, 'upload.xlsx')
    const detectedType = await fileTypeFromBuffer(req.file.buffer)

    const isAllowedSpreadsheetType = Boolean(detectedType && SPREADSHEET_MIME_ALLOWLIST.has(detectedType.mime))
    const isLegacyXls = hasLegacyXlsSignature(req.file.buffer)
    const isCsv = isLikelyCsvUpload(req.file, detectedType)

    if (!isAllowedSpreadsheetType && !isLegacyXls && !isCsv) {
      return res.status(400).json({
        message: 'Invalid file: content does not match a valid spreadsheet format'
      })
    }

    const fileName = generateUploadedFileName(req.file.originalname)
    const storedFile = await storeValidatedUpload(req.file.buffer, fileName, req.file.mimetype)

    req.file.filename = fileName
    req.file.path = storedFile.path
    req.file.url = storedFile.url

    return next()
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
    if (req.file?.path) {
      await deleteFile(req.file.path).catch(() => {})
    }
    return res.status(400).json({ message: 'Unable to validate uploaded spreadsheet' })
  }
}

const removeUploadedFile = async (fileUrl) => {
  if (!fileUrl) return

  try {
    if (typeof deleteFile === 'function') {
      await deleteFile(fileUrl)
      return
    }

    const fileName = path.basename(String(fileUrl))
    if (!fileName) return
    await fs.promises.unlink(path.join(uploadPath, fileName)).catch(() => {})
  } catch (error) {
    logger.error(error.message, { stack: error.stack })
  }
}

module.exports = {
  uploadPdf,
  uploadImage,
  uploadSpreadsheet,
  uploadPath,
  validateUploadedPdf,
  validateUploadedImage,
  validateUploadedSpreadsheet,
  removeUploadedFile
}
