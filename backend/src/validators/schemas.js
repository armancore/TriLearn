const { z } = require('zod')

const emptyToUndefined = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const optionalString = (max = 255) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max).optional()
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
const dayOfWeekEnum = z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'])
const attendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE'])
const examTypeEnum = z.enum(['INTERNAL', 'MIDTERM', 'FINAL', 'PRACTICAL'])
const exportFormatEnum = z.enum(['pdf', 'xlsx'])
const applicationStatusEnum = z.enum(['PENDING', 'REVIEWED', 'CONVERTED'])
const absenceTicketStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED'])

const strongPasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format')

const userBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: strongPasswordSchema,
  phone: optionalString(30),
  address: optionalString(255)
})

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
  dateOfBirth: z.string().trim().min(1),
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
  dateOfBirth: z.string().trim().min(1),
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
  dateOfBirth: optionalString(50),
  section: optionalString(20)
})

const createNoticeBody = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(10).max(5000),
  type: noticeTypeEnum.optional()
})

const updateNoticeBody = z.object({
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(10).max(5000),
  type: noticeTypeEnum
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

const qrBody = z.object({
  qrData: z.string().trim().min(10)
})

const absenceTicketBody = z.object({
  attendanceId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000)
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

const updateMarksBody = z.object({
  obtainedMarks: z.coerce.number().int().min(0),
  remarks: optionalString(500)
})

const attendanceManualBody = z.object({
  subjectId: z.string().uuid(),
  attendanceDate: z.string().trim().min(1),
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
  fileUrl: optionalString(1000),
  subjectId: z.string().uuid()
})

const schemas = {
  auth: {
    register: { body: userBaseSchema },
    login: {
      body: z.object({
        email: z.string().trim().email(),
        password: z.string().min(1)
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
        isActive: z.enum(['true', 'false']).optional()
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
        department: z.string().trim().min(2).max(100)
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
        semester: z.coerce.number().int().min(1).max(8),
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
        semester: z.coerce.number().int().min(1).max(8).optional(),
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
        status: applicationStatusEnum
      })
    },
    createStudentFromApplication: {
      params: uuidParam,
      body: z.object({
        studentId: z.string().trim().min(1).max(50),
        department: z.string().trim().min(2).max(100),
        semester: z.coerce.number().int().min(1).max(12),
        section: optionalString(20)
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
        department: optionalString(100)
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
        date: optionalString(50)
      })
    }
  },
  notices: {
    create: { body: createNoticeBody },
    update: { params: uuidParam, body: updateNoticeBody },
    getAll: {
      query: z.object({
        ...paginationQuery,
        type: noticeTypeEnum.optional()
      })
    },
    id: { params: uuidParam }
  },
  marks: {
    create: { body: marksBody },
    update: { params: uuidParam, body: updateMarksBody },
    bySubject: {
      params: z.object({ subjectId: z.string().uuid() }),
      query: z.object({
        ...paginationQuery,
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
        semester: z.coerce.number().int().min(1).max(12).optional()
      })
    },
    id: { params: uuidParam }
  },
  departments: {
    create: { body: departmentBody },
    update: { params: uuidParam, body: departmentBody },
    id: { params: uuidParam }
  },
  assignments: {
    create: { body: assignmentBody },
    update: { params: uuidParam, body: assignmentUpdateBody },
    id: { params: uuidParam },
    getAll: {
      query: z.object({
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
        obtainedMarks: z.coerce.number().int().min(0)
      })
    }
  },
  materials: {
    create: { body: materialBody },
    id: { params: uuidParam },
    bySubject: { params: z.object({ subjectId: z.string().uuid() }) }
  }
}

module.exports = { schemas, strongPasswordSchema }
