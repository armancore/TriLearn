const { errorInfo } = require('./errorInfo')
const fs = require('fs')
const path = require('path')
const logger = require('./logger')

const backendRoot = path.resolve(__dirname, '..', '..')

const normalizePublicPath = (/** @type {string | undefined} */ value, fallback = '/api/v1/uploads') => {
  const normalizedValue = String(value || fallback).trim()
  if (!normalizedValue) {
    return fallback
  }

  return `/${normalizedValue.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

const resolveUploadPath = (/** @type {string | undefined} */ value) => {
  if (!value) {
    return path.join(backendRoot, 'uploads')
  }

  if (path.isAbsolute(value)) {
    return value
  }

  const normalizedValue = String(value).trim().replace(/^[.][/\\]/, '')
  const backendPrefixedValue = normalizedValue.replace(/^backend[/\\]/i, '')

  return path.resolve(backendRoot, backendPrefixedValue)
}

const uploadPath = resolveUploadPath(process.env.UPLOAD_DIR)
const legacyUploadPaths = [...new Set([
  path.join(backendRoot, 'backend', 'uploads')
].filter((candidatePath) => candidatePath !== uploadPath))]

const uploadPublicPath = normalizePublicPath(process.env.UPLOAD_PUBLIC_PATH, '/api/v1/uploads')
const uploadPublicPaths = [...new Set([
  uploadPublicPath,
  '/api/v1/uploads',
  '/uploads'
])]
const uploadBaseUrl = (process.env.UPLOAD_BASE_URL || '').trim().replace(/\/$/, '')

/**
 * @type {import("@aws-sdk/client-s3").S3Client | null}
 */
let s3Client = null
let localStorageWarningShown = false

const getS3Config = () => {
  const bucket = String(process.env.S3_BUCKET || '').trim()
  const region = String(process.env.S3_REGION || '').trim()
  const accessKeyId = String(process.env.S3_ACCESS_KEY || '').trim()
  const secretAccessKey = String(process.env.S3_SECRET_KEY || '').trim()
  const endpoint = String(process.env.S3_ENDPOINT || '').trim()
  const forcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true'

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return null
  }

  return { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle }
}

const isS3Configured = () => Boolean(getS3Config())

const buildUploadedFileUrl = (/** @type {{url?: string, filename?: string} | null | undefined} */ file) => {
  if (file?.url) return file.url
  if (!file?.filename) return undefined

  const relativePath = `${uploadPublicPath}/${file.filename}`
  return uploadBaseUrl ? `${uploadBaseUrl}${relativePath}` : relativePath
}

const ensureLocalUploadDirectory = async () => {
  await fs.promises.mkdir(uploadPath, { recursive: true })
}

const getS3Client = () => {
  const config = getS3Config()
  if (!config) {
    return null
  }

  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3')
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  }

  return s3Client
}

const uploadFile = async (/** @type {Buffer} */ fileBuffer, /** @type {string} */ fileName, /** @type {string} */ mimeType) => {
  const s3Config = getS3Config()
  const s3 = getS3Client()

  if (s3Config && s3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3')
    try {
      await s3.send(new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: fileName,
        Body: fileBuffer,
        ContentType: mimeType
      }))
    } catch (error) {
      logger.error('S3 upload failed', {
        message: errorInfo(error).message,
        stack: errorInfo(error).stack,
        bucket: s3Config.bucket,
        region: s3Config.region,
        endpoint: s3Config.endpoint || null,
        forcePathStyle: s3Config.forcePathStyle
      })
      throw error
    }

    return {
      url: buildUploadedFileUrl({ filename: fileName })
    }
  }

  if (!localStorageWarningShown) {
    localStorageWarningShown = true
    logger.warn('Warning: S3 storage is not configured; uploaded files are stored on local disk and are not shared across instances')
  }

  await ensureLocalUploadDirectory()
  await fs.promises.writeFile(path.join(uploadPath, fileName), fileBuffer)

  return { url: buildUploadedFileUrl({ filename: fileName }) }
}

const deleteFile = async (/** @type {string | null | undefined} */ fileUrl) => {
  if (!fileUrl) return

  const fileName = path.basename(String(fileUrl))
  if (!fileName) return

  const s3Config = getS3Config()
  const s3 = getS3Client()

  if (s3Config && s3) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3')
    await s3.send(new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: decodeURIComponent(fileName)
    }))
    return
  }

  await fs.promises.unlink(path.join(uploadPath, fileName)).catch(() => {})
}

const getSafeResponseHeaderValue = (/** @type {unknown} */ value) => String(value || '')
  .replace(/[\r\n"]/g, '_')
  .trim()

const getPresignedDownloadUrl = async (/** @type {string} */ fileName, /** @type {{downloadName?: string, contentType?: string}} */ options = {}) => {
  const s3Config = getS3Config()
  const s3 = getS3Client()

  if (!s3Config || !s3) {
    return null
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3')
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

  const downloadName = getSafeResponseHeaderValue(options.downloadName || path.basename(String(fileName || '')))
  const contentType = getSafeResponseHeaderValue(options.contentType || 'application/octet-stream')

  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: decodeURIComponent(fileName),
    ResponseContentDisposition: `attachment; filename="${downloadName || 'download'}"`,
    ResponseContentType: contentType || 'application/octet-stream'
  }), {
    expiresIn: Number.parseInt(process.env.S3_PRESIGNED_URL_TTL_SECONDS || '300', 10)
  })
}

const streamToBuffer = async (/** @type {AsyncIterable<Uint8Array | string>} */ stream) => {
  const chunks = []

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

const getFileBuffer = async (/** @type {string} */ fileName) => {
  const s3Config = getS3Config()
  const s3 = getS3Client()

  if (!s3Config || !s3) {
    return null
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3')
  const response = await s3.send(new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: decodeURIComponent(fileName)
  }))

  if (!response.Body) {
    return null
  }

  if (typeof response.Body.transformToByteArray === 'function') {
    return Buffer.from(await response.Body.transformToByteArray())
  }

  if (Symbol.asyncIterator in response.Body) return streamToBuffer(response.Body)
  throw new Error("Unsupported object storage response body")
}

module.exports = {
  uploadPath,
  legacyUploadPaths,
  uploadPublicPath,
  uploadPublicPaths,
  buildUploadedFileUrl,
  isS3Configured,
  uploadFile,
  getFileBuffer,
  getPresignedDownloadUrl,
  deleteFile
}
