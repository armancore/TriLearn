const zod = require('zod')
const {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31
} = require('@asteasolutions/zod-to-openapi')

extendZodWithOpenApi(zod)

const { z } = zod
const { schemas } = require('../validators/schemas')

const registry = new OpenAPIRegistry()
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT'
})

const MessageResponse = registry.register(
  'MessageResponse',
  z.object({ message: z.string() }).openapi({
    example: { message: 'Operation completed successfully' }
  })
)

const AuthUser = registry.register(
  'AuthUser',
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']),
    avatar: z.string().nullable().optional(),
    mustChangePassword: z.boolean().optional(),
    profileCompleted: z.boolean().optional()
  }).openapi({
    example: {
      id: '8c56002a-3a62-4754-a7e9-a2a8f16853ec',
      name: 'Student One',
      email: 'student@example.com',
      role: 'STUDENT',
      mustChangePassword: false,
      profileCompleted: true
    }
  })
)

const StudentProfile = registry.register(
  'StudentProfile',
  z.object({
    id: z.string().uuid(),
    rollNumber: z.string(),
    semester: z.number().int(),
    section: z.string().nullable().optional(),
    department: z.string().nullable().optional()
  }).openapi({
    example: {
      id: '63f09f1f-9f96-42f8-a25a-4da23eaad52d',
      rollNumber: 'BIT-2026-001',
      semester: 3,
      section: 'A',
      department: 'BIT'
    }
  })
)

const UserResponse = registry.register(
  'UserResponse',
  z.object({
    user: AuthUser.extend({
      student: StudentProfile.nullable().optional()
    })
  }).openapi({
    example: {
      user: {
        id: '8c56002a-3a62-4754-a7e9-a2a8f16853ec',
        name: 'Student One',
        email: 'student@example.com',
        role: 'STUDENT',
        student: {
          id: '63f09f1f-9f96-42f8-a25a-4da23eaad52d',
          rollNumber: 'BIT-2026-001',
          semester: 3,
          section: 'A',
          department: 'BIT'
        }
      }
    }
  })
)

const LoginRequest = registry.register(
  'LoginRequest',
  schemas.auth.login.body.openapi({
    example: {
      email: 'student@example.com',
      password: 'Password123'
    }
  })
)

const LoginResponse = registry.register(
  'LoginResponse',
  z.object({
    token: z.string(),
    refreshToken: z.string().optional(),
    user: AuthUser
  }).openapi({
    example: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'mobile-refresh-token',
      user: {
        id: '8c56002a-3a62-4754-a7e9-a2a8f16853ec',
        name: 'Student One',
        email: 'student@example.com',
        role: 'STUDENT'
      }
    }
  })
)

const MobileRefreshRequest = registry.register(
  'MobileRefreshRequest',
  z.object({ refreshToken: z.string().min(1) }).openapi({
    example: { refreshToken: 'mobile-refresh-token' }
  })
)

const TokenResponse = registry.register(
  'TokenResponse',
  z.object({
    token: z.string(),
    refreshToken: z.string().optional()
  }).openapi({
    example: {
      token: 'new-access-token',
      refreshToken: 'rotated-mobile-refresh-token'
    }
  })
)

const AttendanceManualRequest = registry.register(
  'AttendanceManualRequest',
  schemas.attendance.manual.body.openapi({
    example: {
      subjectId: '3df9f708-8c1a-4e29-ae8e-bf3d47e1870f',
      attendanceDate: '2026-05-01',
      semester: 3,
      section: 'A',
      attendanceList: [
        {
          studentId: '63f09f1f-9f96-42f8-a25a-4da23eaad52d',
          status: 'PRESENT'
        }
      ]
    }
  })
)

const MarkRequest = registry.register(
  'MarkRequest',
  schemas.marks.create.body.openapi({
    example: {
      studentId: '63f09f1f-9f96-42f8-a25a-4da23eaad52d',
      subjectId: '3df9f708-8c1a-4e29-ae8e-bf3d47e1870f',
      examType: 'FINAL',
      totalMarks: 100,
      obtainedMarks: 86,
      remarks: 'Strong final submission'
    }
  })
)

const StudentApplicationRequest = registry.register(
  'StudentApplicationRequest',
  schemas.auth.studentIntake.body.openapi({
    example: {
      fullName: 'Student One',
      email: 'student@example.com',
      phone: '9800000000',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      fatherPhone: '9800000001',
      motherPhone: '9800000002',
      bloodGroup: 'A+',
      localGuardianName: 'Guardian Name',
      localGuardianAddress: 'Kathmandu',
      localGuardianPhone: '9800000003',
      permanentAddress: 'Bhaktapur',
      temporaryAddress: 'Lalitpur',
      dateOfBirth: '2005-01-01',
      preferredDepartment: 'BIT'
    }
  })
)

const jsonBody = (schema) => ({
  content: {
    'application/json': {
      schema
    }
  }
})

const jsonResponse = (description, schema = MessageResponse) => ({
  description,
  content: {
    'application/json': {
      schema
    }
  }
})

const errorResponses = {
  400: jsonResponse('Bad request'),
  401: jsonResponse('Unauthorized'),
  403: jsonResponse('Forbidden'),
  404: jsonResponse('Not found'),
  500: jsonResponse('Internal server error')
}

const registerRoute = ({
  method,
  path,
  tags,
  summary,
  description,
  schema,
  request,
  responses,
  security = [{ bearerAuth: [] }]
}) => {
  registry.registerPath({
    method,
    path,
    tags,
    summary,
    description,
    security,
    request: {
      ...(schema?.params ? { params: schema.params } : {}),
      ...(schema?.query ? { query: schema.query } : {}),
      ...(schema?.body ? { body: jsonBody(schema.body) } : {}),
      ...request
    },
    responses: {
      200: jsonResponse('Success'),
      ...responses,
      ...errorResponses
    }
  })
}

const routeGroups = {
  Auth: [
    ['post', '/auth/register', 'Register a user', schemas.auth.register, { 201: jsonResponse('Created', UserResponse) }, []],
    ['post', '/auth/student-intake', 'Submit student intake application', { body: StudentApplicationRequest }, { 200: jsonResponse('Application received') }, []],
    ['post', '/auth/login', 'Sign in and receive JWT tokens', { body: LoginRequest }, { 200: jsonResponse('Authenticated', LoginResponse) }, []],
    ['post', '/auth/forgot-password', 'Request password reset email', schemas.auth.forgotPassword, {}, []],
    ['post', '/auth/resend-verification', 'Request a new email verification link', schemas.auth.resendVerification, {}, []],
    ['post', '/auth/reset-password', 'Reset password with token', schemas.auth.resetPassword, {}, []],
    ['post', '/auth/refresh', 'Rotate web refresh cookie', null, { 200: jsonResponse('Token refreshed', TokenResponse) }, []],
    ['post', '/auth/refresh/mobile', 'Rotate mobile refresh token', { body: MobileRefreshRequest }, { 200: jsonResponse('Token refreshed', TokenResponse) }, []],
    ['post', '/auth/logout', 'Logout current session', null, {}, []],
    ['post', '/auth/logout-all', 'Logout all sessions'],
    ['get', '/auth/me', 'Get current user', null, { 200: jsonResponse('Current user', UserResponse) }],
    ['get', '/auth/activity', 'Get login/session activity'],
    ['get', '/auth/student-id-qr', 'Get signed student ID QR'],
    ['patch', '/auth/profile', 'Update profile', schemas.auth.updateProfile],
    ['post', '/auth/change-password', 'Change password', schemas.auth.changePassword],
    ['patch', '/auth/complete-profile', 'Complete student profile', schemas.auth.completeProfile]
  ],
  Students: [
    ['get', '/admin/users', 'List users and students', schemas.admin.getAllUsers],
    ['get', '/admin/users/{id}', 'Get user or student by id', schemas.admin.userId, { 200: jsonResponse('User', UserResponse) }],
    ['post', '/admin/users/student', 'Create student account', schemas.admin.createStudent, { 201: jsonResponse('Student created', UserResponse) }],
    ['put', '/admin/users/{id}', 'Update user or student', schemas.admin.updateUser],
    ['delete', '/admin/users/{id}', 'Delete user and related profile data', schemas.admin.userId],
    ['get', '/admin/student-applications', 'List student applications', schemas.admin.getStudentApplications],
    ['patch', '/admin/student-applications/{id}/status', 'Update student application status', schemas.admin.updateStudentApplicationStatus],
    ['post', '/admin/student-applications/{id}/create-account', 'Create account from student application', schemas.admin.createStudentFromApplication, { 201: jsonResponse('Student created', UserResponse) }],
    ['delete', '/admin/student-applications/{id}', 'Delete student application', schemas.admin.studentApplicationId]
  ],
  Instructors: [
    ['post', '/admin/users/instructor', 'Create instructor account', schemas.admin.createInstructor, { 201: jsonResponse('Instructor created', UserResponse) }],
    ['post', '/admin/users/coordinator', 'Create coordinator account', schemas.admin.createCoordinator, { 201: jsonResponse('Coordinator created', UserResponse) }],
    ['post', '/subjects', 'Create subject', schemas.subjects.create, { 201: jsonResponse('Subject created') }],
    ['put', '/subjects/{id}', 'Update subject', schemas.subjects.update],
    ['get', '/subjects', 'List subjects', schemas.subjects.getAll],
    ['get', '/subjects/{id}', 'Get subject', schemas.subjects.id],
    ['patch', '/subjects/{id}/assign-instructor', 'Assign instructor to subject', schemas.subjects.assignInstructor],
    ['put', '/subjects/{id}/enrollments', 'Update subject enrollments', schemas.subjects.updateEnrollments]
  ],
  Attendance: [
    ['post', '/attendance/generate-qr', 'Generate class attendance QR', schemas.attendance.generateQr],
    ['post', '/attendance/manual', 'Mark attendance manually', { body: AttendanceManualRequest }],
    ['post', '/attendance/scan-qr', 'Student scans class attendance QR', schemas.attendance.scanQr],
    ['post', '/attendance/scan-daily-qr', 'Student scans daily gate QR', schemas.attendance.scanQr],
    ['post', '/attendance/scan-student-id', 'Staff scans student ID QR', schemas.attendance.scanStudentId],
    ['get', '/attendance/my', 'Get current student attendance'],
    ['get', '/attendance/subject/{subjectId}', 'Get subject attendance', schemas.attendance.getBySubject],
    ['get', '/attendance/subject/{subjectId}/roster', 'Get subject roster', schemas.attendance.getBySubject],
    ['get', '/attendance/subject/{subjectId}/monthly-report', 'Get monthly attendance report', schemas.attendance.monthlyReport],
    ['get', '/attendance/coordinator/department-report', 'Get coordinator department attendance report', schemas.attendance.coordinatorReport],
    ['get', '/attendance/gate-settings', 'Get gate attendance settings', schemas.attendance.gateSettings],
    ['post', '/attendance/gate-settings/windows', 'Create gate scan window', schemas.attendance.createGateWindow],
    ['put', '/attendance/gate-settings/windows/{id}', 'Update gate scan window', schemas.attendance.updateGateWindow],
    ['delete', '/attendance/gate-settings/windows/{id}', 'Delete gate scan window', schemas.attendance.deleteGateWindow],
    ['post', '/attendance/gate-settings/holidays', 'Create attendance holiday', schemas.attendance.createHoliday],
    ['delete', '/attendance/gate-settings/holidays/{id}', 'Delete attendance holiday', schemas.attendance.deleteHoliday]
  ],
  Marks: [
    ['post', '/marks', 'Create mark for a student', { body: MarkRequest }, { 201: jsonResponse('Mark created') }],
    ['post', '/marks/bulk', 'Create marks in bulk', schemas.marks.bulkCreate, { 201: jsonResponse('Marks created') }],
    ['put', '/marks/{id}', 'Update mark', schemas.marks.update],
    ['delete', '/marks/{id}', 'Delete mark', schemas.marks.id],
    ['post', '/marks/publish', 'Publish marks', schemas.marksPublication.publish],
    ['get', '/marks/review', 'Review marks by coordinator/admin', schemas.marks.review],
    ['get', '/marks/subject/{subjectId}', 'Get marks by subject', schemas.marks.bySubject],
    ['get', '/marks/subject/{subjectId}/students', 'Get enrolled students for marks entry', schemas.marks.bySubject],
    ['get', '/marks/my', 'Get current student marks'],
    ['get', '/marks/my/summary', 'Get current student marks summary', schemas.marks.mySummary],
    ['get', '/marks/my/marksheet', 'Export current student marksheet', schemas.marks.mySummary]
  ],
  Assignments: [
    ['post', '/assignments', 'Create assignment', schemas.assignments.create, { 201: jsonResponse('Assignment created') }],
    ['put', '/assignments/{id}', 'Update assignment', schemas.assignments.update],
    ['delete', '/assignments/{id}', 'Delete assignment', schemas.assignments.id],
    ['get', '/assignments', 'List assignments', schemas.assignments.getAll],
    ['get', '/assignments/{id}', 'Get assignment', schemas.assignments.id],
    ['post', '/assignments/{id}/submit', 'Submit assignment', schemas.assignments.submit],
    ['get', '/assignments/my-submissions', 'Get current student submissions'],
    ['patch', '/assignments/submissions/{submissionId}/grade', 'Grade submission', schemas.assignments.grade]
  ],
  Notices: [
    ['post', '/notices', 'Create notice', schemas.notices.create, { 201: jsonResponse('Notice created') }],
    ['put', '/notices/{id}', 'Update notice', schemas.notices.update],
    ['delete', '/notices/{id}', 'Delete notice', schemas.notices.id],
    ['get', '/notices', 'List notices', schemas.notices.getAll],
    ['get', '/notices/{id}', 'Get notice', schemas.notices.id]
  ],
  Tickets: [
    ['get', '/attendance/tickets/my', 'Get current student absence tickets'],
    ['post', '/attendance/tickets', 'Create absence ticket', schemas.attendance.createTicket, { 201: jsonResponse('Ticket created') }],
    ['get', '/attendance/tickets', 'List absence tickets for staff'],
    ['patch', '/attendance/tickets/{id}', 'Review absence ticket', schemas.attendance.reviewTicket]
  ]
}

Object.entries(routeGroups).forEach(([tag, routes]) => {
  routes.forEach(([method, path, summary, schema, responses, security]) => {
    registerRoute({
      method,
      path: `/api/v1${path}`,
      tags: [tag],
      summary,
      schema,
      responses: responses || {},
      security: security === undefined ? [{ bearerAuth: [] }] : security
    })
  })
})

const generateOpenApiDocument = () => {
  const generator = new OpenApiGeneratorV31(registry.definitions)

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'TriLearn API',
      version: '1.0.0',
      description: 'Development OpenAPI documentation for the TriLearn backend.'
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development server'
      },
      {
        url: '/api/v1',
        description: 'API v1 base path'
      }
    ],
    security: [{ bearerAuth: [] }]
  })
}

const openApiDocument = generateOpenApiDocument()

module.exports = {
  registry,
  schemas,
  routeGroups,
  openApiDocument,
  generateOpenApiDocument
}
