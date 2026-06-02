const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')

const resolveFromTest = (...segments) => path.resolve(__dirname, '..', ...segments)

const loadSharedWithPrisma = (prisma) => {
  process.env.ATTENDANCE_TIMEZONE = 'UTC'

  const modulePath = resolveFromTest('src', 'services', 'attendance', 'shared.service.js')
  const localRequire = createRequire(modulePath)
  const prismaPath = localRequire.resolve('../../utils/prisma')
  const previousPrisma = require.cache[prismaPath]
  const attendanceModulePaths = [
    modulePath,
    localRequire.resolve('./time.helpers'),
    localRequire.resolve('./subject.helpers'),
    localRequire.resolve('./gate-window.service'),
    localRequire.resolve('./qr-payload.helpers'),
    localRequire.resolve('./student-lookup.service'),
    localRequire.resolve('./attendance-write.service'),
    localRequire.resolve('./report-payload.service')
  ]
  const previousAttendanceModules = new Map(
    attendanceModulePaths.map((attendanceModulePath) => [attendanceModulePath, require.cache[attendanceModulePath]])
  )

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma
  }
  attendanceModulePaths.forEach((attendanceModulePath) => {
    delete require.cache[attendanceModulePath]
  })

  try {
    return require(modulePath)
  } finally {
    if (previousPrisma) {
      require.cache[prismaPath] = previousPrisma
    } else {
      delete require.cache[prismaPath]
    }

    previousAttendanceModules.forEach((previousModule, attendanceModulePath) => {
      if (previousModule) {
        require.cache[attendanceModulePath] = previousModule
      } else {
        delete require.cache[attendanceModulePath]
      }
    })
  }
}

test('gate eligibility returns all scheduled routines for the day after an active scan window allows the student', async () => {
  const prisma = {
    attendanceHoliday: { findFirst: async () => null },
    gateScanWindow: {
      findMany: async () => [{
        id: 'window-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:15',
        endTime: '09:45',
        allowedSemesters: [4],
        isActive: true
      }]
    },
    student: {
      findUnique: async () => ({
        id: 'student-1',
        semester: 4,
        department: 'BCA',
        section: 'A'
      })
    },
    routine: {
      findMany: async () => [
        {
          id: 'routine-1',
          subjectId: 'subject-1',
          semester: 4,
          department: 'BCA',
          section: 'A',
          startTime: '09:30',
          endTime: '11:00',
          subject: { id: 'subject-1', name: 'Database', code: 'DB101' }
        },
        {
          id: 'routine-2',
          subjectId: 'subject-2',
          semester: 4,
          department: 'BCA',
          section: 'A',
          startTime: '11:00',
          endTime: '12:45',
          subject: { id: 'subject-2', name: 'Networks', code: 'NW101' }
        }
      ]
    }
  }

  const { getEligibleGateAttendanceForStudent } = loadSharedWithPrisma(prisma)
  const result = await getEligibleGateAttendanceForStudent({
    id: 'student-1',
    semester: 4,
    department: 'BCA',
    section: 'A'
  }, new Date('2026-04-06T09:30:00.000Z'))

  assert.ifError(result.error)
  assert.deepEqual(result.routines.map((routine) => routine.subjectId), ['subject-1', 'subject-2'])
})

test('closed gate window absence sync creates absences for all scheduled routines that day', async () => {
  const createManyCalls = []
  const prisma = {
    attendanceHoliday: { findFirst: async () => null },
    gateScanWindow: {
      findMany: async () => [{
        id: 'window-1',
        dayOfWeek: 'MONDAY',
        startTime: '09:15',
        endTime: '09:45',
        allowedSemesters: [4],
        isActive: true
      }]
    },
    student: {
      findMany: async () => [{
        id: 'student-1',
        semester: 4,
        department: 'BCA',
        section: 'A'
      }]
    },
    routine: {
      findMany: async () => [
        {
          id: 'routine-1',
          subjectId: 'subject-1',
          instructorId: 'instructor-1',
          semester: 4,
          department: 'BCA',
          section: 'A',
          startTime: '09:30',
          endTime: '11:00',
          subject: { id: 'subject-1', enrollments: [{ studentId: 'student-1' }] }
        },
        {
          id: 'routine-2',
          subjectId: 'subject-2',
          instructorId: 'instructor-2',
          semester: 4,
          department: 'BCA',
          section: 'A',
          startTime: '11:00',
          endTime: '12:45',
          subject: { id: 'subject-2', enrollments: [{ studentId: 'student-1' }] }
        }
      ]
    },
    attendance: {
      findMany: async () => [],
      createMany: async (payload) => {
        createManyCalls.push(payload)
      }
    }
  }

  const { syncClosedRoutineAbsences } = loadSharedWithPrisma(prisma)
  await syncClosedRoutineAbsences(new Date('2026-04-06T10:00:00.000Z'))

  assert.equal(createManyCalls.length, 1)
  assert.deepEqual(createManyCalls[0].data.map((record) => ({
    studentId: record.studentId,
    subjectId: record.subjectId,
    status: record.status
  })), [
    { studentId: 'student-1', subjectId: 'subject-1', status: 'ABSENT' },
    { studentId: 'student-1', subjectId: 'subject-2', status: 'ABSENT' }
  ])
})
