const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { TextDecoder } = require('util')
const multer = require('multer')
const sharp = require('sharp')
const { fileTypeFromBuffer } = require('file-type')
const { PDFDocument, PDFName } = require('pdf-lib')
const logger = require('../utils/logger')
const fileStorage = require('../utils/fileStorage')
const prisma = require('../utils/prisma')

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

const generateReencodedImageFileName = (originalname) => {
  const baseName = sanitizeUploadedOriginalName(originalname, 'upload-image')
    .replace(/\.[^.]*$/, '')
  return `${crypto.randomUUID()}-${baseName || 'upload-image'}.png`
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

const registerUploadedFile = async (req) => {
  if (!req.user?.id || !req.file?.filename || !req.file?.url) {
    return
  }

  if (!prisma.uploadedFile?.upsert) {
    return
  }

  await prisma.uploadedFile.upsert({
    where: { fileName: req.file.filename },
    create: {
      fileName: req.file.filename,
      fileUrl: req.file.url,
      mimeType: req.file.mimetype || null,
      storage: isS3Configured() ? 'S3' : 'LOCAL',
      uploadedById: req.user.id
    },
    update: {
      fileUrl: req.file.url,
      mimeType: req.file.mimetype || null,
      storage: isS3Configured() ? 'S3' : 'LOCAL',
      uploadedById: req.user.id
    }
  })
}

const lookupPdfObject = (pdfDoc, object) => {
  if (!object || !pdfDoc?.context?.lookup) {
    return object
  }

  return pdfDoc.context.lookup(object)
}

const buildPdfNameMap = (names) => Object.fromEntries(names.map((name) => [name, PDFName.of(name)]))

const deletePdfDictionaryKeys = (dictionary, keys) => {
  if (!dictionary?.delete) {
    return
  }

  keys.forEach((key) => {
    dictionary.delete(key)
  })
}

const sanitizePdfObject = (pdfDoc, object, activeContentKeys, visited = new Set()) => {
  const resolvedObject = lookupPdfObject(pdfDoc, object)
  if (!resolvedObject || visited.has(resolvedObject)) {
    return
  }

  visited.add(resolvedObject)

  if (resolvedObject.entries) {
    for (const [, value] of Array.from(resolvedObject.entries())) {
      sanitizePdfObject(pdfDoc, value, activeContentKeys, visited)
    }
    deletePdfDictionaryKeys(resolvedObject, activeContentKeys)
  }

  if (resolvedObject.asArray) {
    for (const value of resolvedObject.asArray()) {
      sanitizePdfObject(pdfDoc, value, activeContentKeys, visited)
    }
  }
}

const sanitizePdfAnnotations = (pdfDoc, pdfNames, activeContentKeys) => {
  for (const page of pdfDoc.getPages()) {
    deletePdfDictionaryKeys(page.node, [pdfNames.AA])

    const annotations = lookupPdfObject(pdfDoc, page.node.get(pdfNames.Annots))

    if (!annotations?.asArray) {
      continue
    }

    for (let index = 0; index < annotations.asArray().length; index += 1) {
      const annotation = lookupPdfObject(pdfDoc, annotations.lookup?.(index) || annotations.get?.(index))
      sanitizePdfObject(pdfDoc, annotation, activeContentKeys)
    }
  }
}

const sanitizePdfCatalog = (pdfDoc, pdfNames, activeContentKeys) => {
  if (!pdfDoc.catalog) {
    return
  }

  sanitizePdfObject(pdfDoc, pdfDoc.catalog.get?.(pdfNames.OpenAction), activeContentKeys)
  sanitizePdfObject(pdfDoc, pdfDoc.catalog.get?.(pdfNames.AA), activeContentKeys)
  sanitizePdfObject(pdfDoc, pdfDoc.catalog.get?.(pdfNames.AF), activeContentKeys)
  sanitizePdfObject(pdfDoc, pdfDoc.catalog.get?.(pdfNames.AcroForm), activeContentKeys)

  const names = lookupPdfObject(pdfDoc, pdfDoc.catalog.get?.(pdfNames.Names))
  if (names) {
    sanitizePdfObject(pdfDoc, names.get?.(pdfNames.JavaScript), activeContentKeys)
    sanitizePdfObject(pdfDoc, names.get?.(pdfNames.EmbeddedFiles), activeContentKeys)
    deletePdfDictionaryKeys(names, [
      pdfNames.JavaScript,
      pdfNames.EmbeddedFiles
    ])
  }

  deletePdfDictionaryKeys(pdfDoc.catalog, [
    pdfNames.OpenAction,
    pdfNames.AA,
    pdfNames.AF,
    pdfNames.XFA
  ])

  sanitizePdfObject(pdfDoc, pdfDoc.catalog, activeContentKeys)
}

const sanitizePdfForm = (pdfDoc, pdfNames, activeContentKeys) => {
  if (!pdfDoc.getForm) {
    return
  }

  const form = pdfDoc.getForm()
  deletePdfDictionaryKeys(form.acroForm?.dict, [
    pdfNames.XFA,
    ...activeContentKeys
  ])

  if (form.getFields) {
    form.getFields().forEach((field) => {
      sanitizePdfObject(pdfDoc, field.acroField?.dict, activeContentKeys)
    })
  }

  form.flatten()
}

const sanitizePdfIndirectObjects = (pdfDoc, activeContentKeys) => {
  if (!pdfDoc.context?.enumerateIndirectObjects) {
    return
  }

  for (const [, object] of pdfDoc.context.enumerateIndirectObjects()) {
    sanitizePdfObject(pdfDoc, object, activeContentKeys)
  }
}

const sanitizePdfActiveContent = async (pdfDoc) => {
  if (!PDFName || !pdfDoc?.getPages) {
    return null
  }

  const pdfNames = buildPdfNameMap([
    'A',
    'AA',
    'AcroForm',
    'AF',
    'Action',
    'Annots',
    'EmbeddedFiles',
    'JavaScript',
    'JS',
    'Names',
    'OpenAction',
    'XFA'
  ])
  const activeContentKeys = [
    pdfNames.A,
    pdfNames.Action,
    pdfNames.AA,
    pdfNames.JS,
    pdfNames.XFA
  ]

  sanitizePdfAnnotations(pdfDoc, pdfNames, activeContentKeys)
  sanitizePdfCatalog(pdfDoc, pdfNames, activeContentKeys)
  sanitizePdfForm(pdfDoc, pdfNames, activeContentKeys)
  sanitizePdfIndirectObjects(pdfDoc, activeContentKeys)

  if (!pdfDoc.save) {
    return null
  }

  return Buffer.from(await pdfDoc.save())
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

    const pdfDoc = await PDFDocument.load(req.file.buffer)
    const sanitizedBuffer = await sanitizePdfActiveContent(pdfDoc)
    if (sanitizedBuffer) {
      req.file.buffer = sanitizedBuffer
    }

    const fileName = generateUploadedFileName(req.file.originalname)
    const storedFile = await storeValidatedUpload(req.file.buffer, fileName, req.file.mimetype)

    req.file.filename = fileName
    req.file.path = storedFile.path
    req.file.url = storedFile.url
    await registerUploadedFile(req)

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

    const fileName = generateReencodedImageFileName(req.file.originalname)
    let processedBuffer

    try {
      const processor = sharp(req.file.buffer).rotate().png()
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
      ? await storeValidatedUpload(processedBuffer, fileName, 'image/png')
      : { path: path.join(uploadPath, fileName), url: path.join(uploadPath, fileName) }

    req.file.filename = fileName
    req.file.path = storedFile.path
    req.file.url = storedFile.url
    req.file.mimetype = 'image/png'
    await registerUploadedFile(req)

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

    if (isLegacyXls) {
      return res.status(400).json({
        message: 'Legacy .xls files are not supported. Please save/export the sheet as .xlsx or CSV and upload it again.'
      })
    }

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
    await registerUploadedFile(req)

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
    const fileName = path.basename(String(fileUrl))
    if (!fileName) return

    const resolvedPath = path.resolve(path.join(uploadPath, fileName))
    const resolvedUploadDir = path.resolve(uploadPath)

    // Prevent path traversal: ensure the resolved path is within the upload directory.
    if (!resolvedPath.startsWith(resolvedUploadDir + path.sep) && resolvedPath !== resolvedUploadDir) {
      logger.error('removeUploadedFile: path traversal attempt blocked', { fileUrl, resolvedPath, resolvedUploadDir })
      return
    }

    await fs.promises.unlink(resolvedPath).catch(() => {})
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
