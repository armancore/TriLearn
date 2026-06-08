const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadWithMocks = (targetPath, mocks) => {
  const modulePath = path.resolve(targetPath)
  const localRequire = createRequire(modulePath)
  const sourceRoot = resolveFromTest('src')
  const previousCacheKeys = new Set(Object.keys(require.cache))
  const touched = []

  for (const [request, mockExports] of Object.entries(mocks)) {
    const resolved = localRequire.resolve(request)
    touched.push({
      resolved,
      previous: require.cache[resolved]
    })
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: mockExports
    }
  }

  delete require.cache[modulePath]

  try {
    return require(modulePath)
  } finally {
    for (const cachedPath of Object.keys(require.cache)) {
      if (!previousCacheKeys.has(cachedPath) && cachedPath.startsWith(sourceRoot)) {
        delete require.cache[cachedPath]
      }
    }

    touched.forEach(({ resolved, previous }) => {
      if (previous) {
        require.cache[resolved] = previous
      } else {
        delete require.cache[resolved]
      }
    })
  }
}

const loadStudentApplicationsService = ({ existingRollNumbers = [] } = {}) => loadWithMocks(
  resolveFromTest('src', 'services', 'studentApplications.service.js'),
  {
    '../utils/prisma': {
      student: {
        findMany: async () => existingRollNumbers.map((rollNumber) => ({ rollNumber }))
      }
    },
    '../utils/enrollment': {
      enrollStudentInMatchingSubjects: async () => {}
    },
    '../utils/logger': {
      error: () => {}
    },
    './department.service': {
      ensureDepartmentExists: async () => true
    },
    '../utils/audit': {
      recordAuditLog: async () => {}
    },
    '../utils/mailer': {
      sendMail: async () => {}
    },
    '../utils/emailTemplates': {
      welcomeTemplate: () => ({ subject: 'Welcome', html: '<p>Welcome</p>', text: 'Welcome' })
    },
    '../utils/emailVerification': {
      buildEmailVerificationUrl: () => 'https://example.test/verify',
      createEmailVerificationToken: () => ({ token: 'token', tokenHash: 'hash', expiresAt: new Date() })
    },
    '../utils/security': {
      hashPassword: async () => 'hashed-password',
      generateTemporaryPassword: () => 'TempPass123!'
    }
  }
)

test('buildStudentIdPrefix sanitizes department-derived prefixes', () => {
  const { buildStudentIdPrefix } = loadStudentApplicationsService()

  assert.equal(
    buildStudentIdPrefix({ code: 'B.C.A+(evil)?' }, new Date('2026-01-01T00:00:00Z')),
    'BCAEVIL-2026'
  )
})

test('generateStudentId parses numeric suffixes without dynamic regular expressions', async () => {
  const { generateStudentId } = loadStudentApplicationsService({
    existingRollNumbers: [
      'BCA-2026-001',
      'BCA-2026-010',
      'BCA-2026-ABC',
      'BCA-2026-010-extra',
      'OTHER-2026-999'
    ]
  })

  const rollNumber = await generateStudentId({ code: 'BCA' })

  assert.equal(rollNumber, 'BCA-2026-011')
})
