const { z } = require('zod')
const { isKnownWeakPassword } = require('../utils/security')
const { isPrivateIpv4, isPrivateIpv6 } = require('../utils/network')

const emptyToUndefined = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const optionalString = (max = 255) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max).optional()
)

const optionalHttpsPublicUrl = (max = 1000) => z.preprocess(
  emptyToUndefined,
  z.string()
    .trim()
    .max(max)
    .url('File URL must be a valid URL')
    .superRefine((value, ctx) => {
      let parsedUrl

      try {
        parsedUrl = new URL(value)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File URL must be a valid URL'
        })
        return
      }

      if (parsedUrl.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File URL must use HTTPS'
        })
      }

      const hostname = parsedUrl.hostname.toLowerCase()
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        isPrivateIpv4(hostname) ||
        isPrivateIpv6(hostname)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'File URL must not target a private network address'
        })
      }
    })
    .optional()
)
const searchQuery = optionalString(100)
const studentSemesterSchema = z.coerce.number().int().min(1).max(8)
const MIN_DATE_OF_BIRTH = new Date(Date.UTC(1920, 0, 1))

const parseDateOnlyToUtc = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed
}

const isDateOfBirthInRange = (value) => {
  const today = new Date()
  const maxDate = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ))

  return value >= MIN_DATE_OF_BIRTH && value <= maxDate
}

const dateOfBirthSchema = z.string()
  .trim()
  .max(10, 'Date of birth must use the YYYY-MM-DD format')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must use the YYYY-MM-DD format')
  .transform((value, ctx) => {
    const parsed = parseDateOnlyToUtc(value)

    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must be a real calendar date'
      })
      return z.NEVER
    }

    if (!isDateOfBirthInRange(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date of birth must be between 1920-01-01 and today'
      })
      return z.NEVER
    }

    return parsed
  })

const optionalDateOfBirthSchema = z.preprocess(
  emptyToUndefined,
  dateOfBirthSchema.optional()
)

const uuidParam = z.object({
  id: z.string().uuid()
})

const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
}

const roleEnum = z.enum(['ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT'])
const noticeTypeEnum = z.enum(['GENERAL', 'EXAM', 'HOLIDAY', 'EVENT', 'URGENT'])
const noticeAudienceEnum = z.enum(['ALL', 'STUDENTS', 'INSTRUCTORS_ONLY'])
const dayOfWeekEnum = z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'])
const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE'])
const examTypeEnum = z.enum(['INTERNAL', 'MIDTERM', 'FINAL', 'PREBOARD', 'PRACTICAL'])
const exportFormatEnum = z.enum(['pdf', 'xlsx'])
const applicationStatusEnum = z.enum(['PENDING', 'REVIEWED', 'CONVERTED'])
const reviewableApplicationStatusEnum = z.enum(['PENDING', 'REVIEWED'])
const absenceTicketStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
const devicePlatformEnum = z.enum(['IOS', 'ANDROID'])

const strongPasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .refine((value) => !isKnownWeakPassword(value), 'Password is too common. Please choose a stronger password')

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')
const minutesFromTime = (timeValue) => {
  const [hours, minutes] = String(timeValue).split(':').map((value) => parseInt(value, 10))
  return (hours * 60) + minutes
}

const userBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: strongPasswordSchema,
  phone: optionalString(30),
  address: optionalString(255)
})

const departmentListSchema = z.array(
  z.string().trim().min(2).max(100)
).min(1).max(20)

const selfProfileBody = z.object({
  phone: z.string().trim().min(7).max(30),
  fatherName: z.string().trim().min(2).max(100),
  motherName: z.string().trim().min(2).max(100),
  fatherPhone: z.string().trim().min(7).max(30),
  motherPhone: z.string().trim().min(7).max(30),
  bloodGroup: optionalString(20),
  localGuardianName: z.string().trim().min(2).max(100),
  localGuardianAddress: z.string().trim().min(5).max(255),
  localGuardianPhone: z.string().trim().min(7).max(30),
  permanentAddress: z.string().trim().min(5).max(255),
  temporaryAddress: z.string().trim().min(5).max(255),
  dateOfBirth: dateOfBirthSchema,
  section: z.string().trim().min(1).max(20)
})

const studentApplicationBody = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(30),
  fatherName: z.string().trim().min(2).max(100),
  motherName: z.string().trim().min(2).max(100),
  fatherPhone: z.string().trim().min(7).max(30),
  motherPhone: z.string().trim().min(7).max(30),
  bloodGroup: optionalString(20),
  localGuardianName: z.string().trim().min(2).max(100),
  localGuardianAddress: z.string().trim().min(5).max(255),
  localGuardianPhone: z.string().trim().min(7).max(30),
  permanentAddress: z.string().trim().min(5).max(255),
  temporaryAddress: z.string().trim().min(5).max(255),
  dateOfBirth: dateOfBirthSchema,
  preferredDepartment: z.string().trim().min(2).max(100)
})

const profileUpdateBody = z.object({
  phone: optionalString(30),
  address: optionalString(255),
  fatherName: optionalString(100),
  motherName: optionalString(100),
  fatherPhone: optionalString(30),
  motherPhone: optionalString(30),
  bloodGroup: optionalString(20),
  localGuardianName: optionalString(100),
  localGuardianAddress: optionalString(255),
  localGuardianPhone: optionalString(30),
  permanentAddress: optionalString(255),
  temporaryAddress: optionalString(255),
  dateOfBirth: optionalDateOfBirthSchema,
  section: optionalString(20)
})

const createNoticeBody = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(10).max(5000),
  type: noticeTypeEnum.optional(),
  audience: noticeAudienceEnum.optional(),
  targetDepartment: optionalString(100),
  targetSemester: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional())
})

const updateNoticeBody = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(10).max(5000),
  type: noticeTypeEnum,
  audience: noticeAudienceEnum,
  targetDepartment: optionalString(100),
  targetSemester: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional())
})

const subjectBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20),
  description: optionalString(1000),
  semester: z.coerce.number().int().min(1).max(12),
  department: optionalString(100),
  instructorId: z.preprocess(emptyToUndefined, z.string().uuid().optional())
})

const updateSubjectBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalString(1000),
  semester: z.coerce.number().int().min(1).max(12),
  department: optionalString(100),
  instructorId: z.preprocess(emptyToUndefined, z.string().uuid().optional())
})

const routineBody = z.object({
  subjectId: z.string().uuid(),
  instructorId: z.string().uuid(),
  department: optionalString(100),
  semester: z.coerce.number().int().min(1).max(12),
  section: optionalString(20),
  combinedGroupId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  dayOfWeek: dayOfWeekEnum,
  startTime: timeSchema,
  endTime: timeSchema,
  room: optionalString(100)
})

const departmentBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20),
  description: optionalString(500)
})

const departmentSectionBody = z.object({
  semester: studentSemesterSchema,
  section: z.string().trim().min(1).max(20)
})

const qrBody = z.object({
  qrData: z.string().trim().min(10)
})

const staffStudentQrBody = z.object({
  qrData: z.preprocess(emptyToUndefined, z.string().trim().min(10).optional()),
  rollNumber: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(50).optional()),
  subjectId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  attendanceDate: optionalString(50)
}).refine((data) => Boolean(data.qrData || data.rollNumber), {
  path: ['qrData'],
  message: 'Provide either qrData or rollNumber'
})

const absenceTicketBody = z.object({
  attendanceId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000)
})

const gateScanWindowBody = z.object({
  title: optionalString(120),
  dayOfWeek: dayOfWeekEnum,
  startTime: timeSchema,
  endTime: timeSchema,
  allowedSemesters: z.array(z.coerce.number().int().min(1).max(12)).min(1).max(12),
  isActive: z.coerce.boolean().optional()
}).refine((data) => minutesFromTime(data.endTime) > minutesFromTime(data.startTime), {
  path: ['endTime'],
  message: 'End time must be later than start time'
})

const attendanceHolidayBody = z.object({
  date: z.string().trim().min(1),
  title: z.string().trim().min(2).max(120),
  description: optionalString(500),
  isActive: z.coerce.boolean().optional()
})

const reviewAbsenceTicketBody = z.object({
  status: absenceTicketStatusEnum,
  response: optionalString(1000)
})

const marksBody = z.object({
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  examType: examTypeEnum,
  totalMarks: z.coerce.number().int().positive(),
  obtainedMarks: z.coerce.number().int().min(0),
  remarks: optionalString(500)
}).refine((data) => data.obtainedMarks <= data.totalMarks, {
  path: ['obtainedMarks'],
  message: 'Obtained marks cannot exceed total marks'
})

const marksBulkEntryBody = z.object({
  studentId: z.string().uuid(),
  obtainedMarks: z.coerce.number().int().min(0),
  remarks: optionalString(500)
})

const marksBulkBody = z.object({
  subjectId: z.string().uuid(),
  examType: examTypeEnum,
  totalMarks: z.coerce.number().int().positive(),
  entries: z.array(marksBulkEntryBody).min(1).max(200)
}).superRefine((data, context) => {
  const seenStudentIds = new Set()

  data.entries.forEach((entry, index) => {
    if (entry.obtainedMarks > data.totalMarks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries', index, 'obtainedMarks'],
        message: 'Obtained marks cannot exceed total marks'
      })
    }

    if (seenStudentIds.has(entry.studentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries', index, 'studentId'],
        message: 'Duplicate student entry in bulk marks payload'
      })
    }

    seenStudentIds.add(entry.studentId)
  })
})

const updateMarksBody = z.object({
  obtainedMarks: z.coerce.number().int().min(0),
  remarks: optionalString(500)
})

const attendanceManualBody = z.object({
  subjectId: z.string().uuid(),
  attendanceDate: z.string().trim().min(1),
  semester: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional()),
  section: optionalString(20),
  attendanceList: z.array(z.object({
    studentId: z.string().uuid(),
    status: attendanceStatusEnum
  })).min(1)
})

const assignmentBody = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  subjectId: z.string().uuid(),
  dueDate: z.string().trim().min(1),
  totalMarks: z.coerce.number().int().positive().max(1000).optional()
})

const assignmentUpdateBody = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  dueDate: z.string().trim().min(1),
  totalMarks: z.coerce.number().int().positive().max(1000).optional()
})

const submissionBody = z.object({
  note: optionalString(1000)
})

const materialBody = z.object({
  title: z.string().trim().min(3).max(150),
  description: optionalString(1000),
  fileUrl: optionalHttpsPublicUrl(1000),
  subjectId: z.string().uuid()
})

const schemas = {
  auth: {
    register: { body: userBaseSchema },
    login: {
      body: z.object({
        email: z.string().trim().email(),
        password: z.string().min(1),
        captchaToken: optionalString(4000),
        captchaAnswer: optionalString(50)
      })
    },
    changePassword: {
      body: z.object({
        currentPassword: z.string().min(1),
        newPassword: strongPasswordSchema
      })
    },
    forgotPassword: {
      body: z.object({
        email: z.string().trim().email()
      })
    },
    studentIntake: {
      body: studentApplicationBody
    },
    resetPassword: {
      body: z.object({
        token: z.string().trim().min(10),
        password: strongPasswordSchema
      })
    },
    completeProfile: {
      body: selfProfileBody
    },
    updateProfile: {
      body: profileUpdateBody
    }
  },
  admin: {
    getAllUsers: {
      query: z.object({
        ...paginationQuery,
        role: roleEnum.optional(),
        isActive: z.enum(['true', 'false']).optional(),
        search: searchQuery,
        semester: z.preprocess(emptyToUndefined, studentSemesterSchema.optional()),
        graduated: z.enum(['true', 'false']).optional()
      })
    },
    userId: { params: uuidParam },
    createCoordinator: {
      body: userBaseSchema.extend({
        department: optionalString(100)
      })
    },
    createGatekeeper: { body: userBaseSchema },
    createInstructor: {
      body: userBaseSchema.extend({
        department: optionalString(100),
        departments: departmentListSchema.optional()
      }).refine((data) => (
        Boolean(data.department) || (Array.isArray(data.departments) && data.departments.length > 0)
      ), {
        path: ['departments'],
        message: 'Select at least one department'
      })
    },
    createStudent: {
      body: z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email(),
        studentId: z.string().trim().min(1).max(50),
        phone: optionalString(30),
        address: optionalString(255),
        department: z.string().trim().min(2).max(100),
        semester: studentSemesterSchema,
        section: z.string().trim().min(1).max(20)
      })
    },
    updateUser: {
      params: uuidParam,
      body: z.object({
        name: z.string().trim().min(2).max(100).optional(),
        phone: optionalString(30),
        address: optionalString(255),
        department: optionalString(100),
        departments: departmentListSchema.optional(),
        semester: studentSemesterSchema.optional(),
        section: optionalString(20)
      })
    },
    getStudentApplications: {
      query: z.object({
        ...paginationQuery,
        status: applicationStatusEnum.optional()
      })
    },
    studentApplicationId: {
      params: uuidParam
    },
    updateStudentApplicationStatus: {
      params: uuidParam,
      body: z.object({
        status: reviewableApplicationStatusEnum
      })
    },
    createStudentFromApplication: {
      params: uuidParam,
      body: z.object({
        studentId: z.string().trim().min(1).max(50),
        department: z.string().trim().min(2).max(100),
        semester: studentSemesterSchema,
        section: optionalString(20)
      })
    },
    bulkAssignStudentSection: {
      body: z.object({
        userIds: z.array(z.string().uuid()).min(1).max(500),
        department: z.string().trim().min(2).max(100),
        semester: studentSemesterSchema,
        section: z.string().trim().min(1).max(20)
      })
    }
  },
  subjects: {
    create: { body: subjectBody },
    update: { params: uuidParam, body: updateSubjectBody },
    getAll: {
      query: z.object({
        ...paginationQuery,
        semester: z.coerce.number().int().min(1).max(12).optional(),
        department: optionalString(100),
        search: searchQuery
      })
    },
    id: { params: uuidParam },
    assignInstructor: {
      params: uuidParam,
      body: z.object({ instructorId: z.string().uuid() })
    },
    updateEnrollments: {
      params: uuidParam,
      body: z.object({
        studentIds: z.array(z.string().uuid())
      })
    }
  },
  attendance: {
    subjectId: { params: z.object({ subjectId: z.string().uuid() }) },
    generateQr: { body: z.object({ subjectId: z.string().uuid() }) },
    manual: { body: attendanceManualBody },
    scanQr: { body: qrBody },
    scanStudentId: { body: staffStudentQrBody },
    gateSettings: {
      query: z.object({
        dayOfWeek: dayOfWeekEnum.optional()
      })
    },
    createGateWindow: { body: gateScanWindowBody },
    updateGateWindow: { params: uuidParam, body: gateScanWindowBody },
    deleteGateWindow: { params: uuidParam },
    createHoliday: { body: attendanceHolidayBody },
    deleteHoliday: { params: uuidParam },
    createTicket: { body: absenceTicketBody },
    reviewTicket: {
      params: uuidParam,
      body: reviewAbsenceTicketBody
    },
    ticketId: { params: uuidParam },
    monthlyReport: {
      params: z.object({ subjectId: z.string().uuid() }),
      query: z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
      })
    },
    coordinatorReport: {
      query: z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
        semester: z.coerce.number().int().min(1).max(12),
        section: optionalString(20)
      })
    },
    coordinatorExport: {
      query: z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
        semester: z.coerce.number().int().min(1).max(12),
        section: optionalString(20),
        format: exportFormatEnum.optional()
      })
    },
    export: {
      params: z.object({ subjectId: z.string().uuid() }),
      query: z.object({
        date: optionalString(50),
        month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
        format: exportFormatEnum.optional()
      })
    },
    getBySubject: {
      params: z.object({ subjectId: z.string().uuid() }),
      query: z.object({
        ...paginationQuery,
        date: optionalString(50),
        semester: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(12).optional()),
        section: optionalString(20)
      })
    }
  },
  notices: {
    create: { body: createNoticeBody },
    update: { params: uuidParam, body: updateNoticeBody },
    getAll: {
      query: z.object({
        ...paginationQuery,
        type: noticeTypeEnum.optional(),
        audience: noticeAudienceEnum.optional(),
        search: searchQuery
      })
    },
    id: { params: uuidParam }
  },
  marks: {
    create: { body: marksBody },
    bulkCreate: { body: marksBulkBody },
    update: { params: uuidParam, body: updateMarksBody },
    review: {
      query: z.object({
        ...paginationQuery,
        examType: examTypeEnum.optional(),
        subjectId: z.preprocess(emptyToUndefined, z.string().uuid().optional())
      })
    },
    bySubject: {
      params: z.object({ subjectId: z.string().uuid() }),
      query: z.object({
        ...paginationQuery,
        examType: examTypeEnum.optional()
      })
    },
    mySummary: {
      query: z.object({
        examType: examTypeEnum.optional()
      })
    },
    id: { params: uuidParam }
  },
  routines: {
    create: { body: routineBody },
    update: { params: uuidParam, body: routineBody },
    getAll: {
      query: z.object({
        dayOfWeek: dayOfWeekEnum.optional(),
        semester: z.coerce.number().int().min(1).max(12).optional(),
        department: optionalString(100),
        section: optionalString(20)
      })
    },
    id: { params: uuidParam }
  },
  departments: {
    create: { body: departmentBody },
    update: { params: uuidParam, body: departmentBody },
    id: { params: uuidParam },
    createSection: { params: uuidParam, body: departmentSectionBody },
    getSections: {
      params: uuidParam,
      query: z.object({
        semester: z.preprocess(emptyToUndefined, studentSemesterSchema.optional())
      })
    },
    sectionId: {
      params: z.object({
        id: z.string().uuid(),
        sectionId: z.string().uuid()
      })
    }
  },
  assignments: {
    create: { body: assignmentBody },
    update: { params: uuidParam, body: assignmentUpdateBody },
    id: { params: uuidParam },
    getAll: {
      query: z.object({
        ...paginationQuery,
        subjectId: z.preprocess(emptyToUndefined, z.string().uuid().optional())
      })
    },
    submit: {
      params: uuidParam,
      body: submissionBody
    },
    grade: {
      params: z.object({ submissionId: z.string().uuid() }),
      body: z.object({
        obtainedMarks: z.coerce.number().int().min(0),
        feedback: optionalString(1000)
      })
    }
  },
  marksPublication: {
    publish: {
      body: z.object({
        subjectId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
        examType: examTypeEnum
      })
    }
  },
  materials: {
    create: { body: materialBody },
    id: { params: uuidParam },
    bySubject: { params: z.object({ subjectId: z.string().uuid() }) }
  },
  notifications: {
    list: {
      query: z.object({
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        unreadOnly: z.enum(['true', 'false']).optional()
      })
    },
    registerDeviceToken: {
      body: z.object({
        token: z.string().trim().min(10).max(4096),
        platform: devicePlatformEnum
      })
    },
    unregisterDeviceToken: {
      body: z.object({
        token: z.string().trim().min(10).max(4096)
      })
    }
  }
}

module.exports = { schemas, strongPasswordSchema }
