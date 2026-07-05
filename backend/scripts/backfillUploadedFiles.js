/**
 * One-time (idempotent) backfill of legacy file references into UploadedFile.
 *
 * Historically some files were referenced only from entity columns
 * (User.avatar, Assignment.questionPdfUrl, Submission.fileUrl,
 * Task.questionPdfUrl, TaskSubmission.fileUrl, StudyMaterial.fileUrl) without a
 * matching UploadedFile row, or with a row that was never stamped with its
 * entityType/entityId. The file-serving route used to compensate with a chain of
 * per-column table scans on every miss. This script materialises every legacy
 * reference into UploadedFile so that fallback can be removed.
 *
 * Safe to run repeatedly: it upserts by the unique fileName and only stamps
 * entityType/entityId on existing rows (never overwriting uploadedById/fileUrl).
 *
 * Usage: node scripts/backfillUploadedFiles.js
 */
const path = require('path')
const prisma = require('../src/utils/prisma')

const PAGE_SIZE = 500

const deriveFileName = (fileUrl) => {
  const raw = String(fileUrl || '').trim()
  if (!raw) {
    return ''
  }

  try {
    const parsed = new URL(raw, 'http://local.upload')
    return path.basename(decodeURIComponent(parsed.pathname))
  } catch {
    return path.basename(raw)
  }
}

const detectStorage = (fileUrl) => (/^https?:\/\//i.test(String(fileUrl || '')) ? 'S3' : 'LOCAL')

// Each source describes how to page over a legacy table and map a row to an
// UploadedFile record. `getUrl` returns the stored reference; `getOwnerId`
// returns the user id used as uploadedById when a row must be created.
const SOURCES = [
  {
    entityType: 'USER_AVATAR',
    label: 'User.avatar',
    page: (cursor) => prisma.user.findMany({
      where: { avatar: { not: null } },
      select: { id: true, avatar: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.avatar,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.id
  },
  {
    entityType: 'ASSIGNMENT',
    label: 'Assignment.questionPdfUrl',
    page: (cursor) => prisma.assignment.findMany({
      where: { questionPdfUrl: { not: null } },
      select: { id: true, questionPdfUrl: true, instructor: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.questionPdfUrl,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.instructor?.userId
  },
  {
    entityType: 'SUBMISSION',
    label: 'Submission.fileUrl',
    page: (cursor) => prisma.submission.findMany({
      where: { fileUrl: { not: null } },
      select: { id: true, fileUrl: true, student: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.fileUrl,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.student?.userId
  },
  {
    entityType: 'TASK',
    label: 'Task.questionPdfUrl',
    page: (cursor) => prisma.task.findMany({
      where: { questionPdfUrl: { not: null } },
      select: { id: true, questionPdfUrl: true, instructor: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.questionPdfUrl,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.instructor?.userId
  },
  {
    entityType: 'TASK_SUBMISSION',
    label: 'TaskSubmission.fileUrl',
    page: (cursor) => prisma.taskSubmission.findMany({
      where: { fileUrl: { not: null } },
      select: { id: true, fileUrl: true, student: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.fileUrl,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.student?.userId
  },
  {
    entityType: 'STUDY_MATERIAL',
    label: 'StudyMaterial.fileUrl',
    page: (cursor) => prisma.studyMaterial.findMany({
      where: { fileUrl: { not: '' } },
      select: { id: true, fileUrl: true, instructor: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    }),
    getUrl: (row) => row.fileUrl,
    getEntityId: (row) => row.id,
    getOwnerId: (row) => row.instructor?.userId
  }
]

const backfillSource = async (source) => {
  const stats = { created: 0, stamped: 0, skipped: 0 }
  let cursor = null

  for (;;) {
    const rows = await source.page(cursor)
    if (rows.length === 0) {
      break
    }

    for (const row of rows) {
      const fileUrl = source.getUrl(row)
      const fileName = deriveFileName(fileUrl)
      const entityId = source.getEntityId(row)
      const ownerId = source.getOwnerId(row)

      if (!fileName || !entityId) {
        stats.skipped += 1
        continue
      }

      const existing = await prisma.uploadedFile.findUnique({
        where: { fileName },
        select: { id: true, entityType: true, entityId: true }
      })

      if (existing) {
        if (existing.entityType !== source.entityType || existing.entityId !== entityId) {
          await prisma.uploadedFile.update({
            where: { fileName },
            data: { entityType: source.entityType, entityId }
          })
          stats.stamped += 1
        } else {
          stats.skipped += 1
        }
        continue
      }

      if (!ownerId) {
        // Cannot create a row without a valid uploadedById (required FK).
        stats.skipped += 1
        continue
      }

      await prisma.uploadedFile.create({
        data: {
          fileName,
          fileUrl,
          storage: detectStorage(fileUrl),
          entityType: source.entityType,
          entityId,
          uploadedById: ownerId
        }
      })
      stats.created += 1
    }

    cursor = rows[rows.length - 1].id
    if (rows.length < PAGE_SIZE) {
      break
    }
  }

  return stats
}

const run = async () => {
  const totals = { created: 0, stamped: 0, skipped: 0 }

  for (const source of SOURCES) {
    const stats = await backfillSource(source)
    totals.created += stats.created
    totals.stamped += stats.stamped
    totals.skipped += stats.skipped
    console.log(
      `${source.label}: created=${stats.created} stamped=${stats.stamped} skipped=${stats.skipped}`
    )
  }

  console.log(
    `Backfill complete: created=${totals.created} stamped=${totals.stamped} skipped=${totals.skipped}`
  )
}

run()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('Backfill failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
