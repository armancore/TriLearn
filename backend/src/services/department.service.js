const { createServiceResponder } = require('../utils/serviceResult')
const prisma = require('../utils/prisma')
const { getInstructorDepartments } = require('../utils/instructorDepartments')
const { normalizeDepartmentList } = require('../utils/instructorDepartments')

const normalizeDepartment = (value) => value ? value.trim() : ''
const normalizeSection = (value) => String(value || '').trim().toUpperCase()
const MAX_SECTION_LENGTH = 20

/**
 * Handles ensure department exists business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const ensureDepartmentExists = async (departmentName) => {
  const normalized = normalizeDepartment(departmentName)
  if (!normalized) return null
  if (typeof prisma.department?.findUnique !== 'function') {
    return { name: normalized }
  }

  const department = await prisma.department.findUnique({
    where: { name: normalized }
  })

  return department
}

const getCoordinatorDepartments = (context) => (
  context?.user?.role === 'COORDINATOR'
    ? normalizeDepartmentList([
      ...(Array.isArray(context.coordinator?.departments) ? context.coordinator.departments : []),
      context.coordinator?.department
    ])
    : []
)

const canManageDepartment = (context, department) => {
  if (!department) {
    return false
  }

  const coordinatorDepartments = getCoordinatorDepartments(context)
  if (coordinatorDepartments.length === 0) {
    return true
  }

  return coordinatorDepartments.includes(department.name)
}

const buildDepartmentSectionSummary = (sections = []) => {
  const semesterMap = sections.reduce((acc, item) => {
    const semesterKey = String(item.semester)
    if (!acc[semesterKey]) {
      acc[semesterKey] = []
    }
    acc[semesterKey].push(item.section)
    return acc
  }, {})

  return Object.entries(semesterMap)
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([semester, values]) => ({
      semester: Number(semester),
      sections: [...new Set(values)].sort((left, right) => left.localeCompare(right))
    }))
}

/**
 * Handles create department business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createDepartment = async (context, result = createServiceResponder()) => {
    const name = normalizeDepartment(context.body.name)
  const code = normalizeDepartment(context.body.code).toUpperCase()
  const description = normalizeDepartment(context.body.description) || null

  if (!name || !code) {
    return result.withStatus(400, { message: 'Department name and code are required' })
  }

  const department = await prisma.department.create({
    data: { name, code, description }
  })

  result.withStatus(201, {
    message: 'Department created successfully!',
    department
  })
}

/**
 * Handles get all departments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllDepartments = async (context, result = createServiceResponder()) => {
    const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      sections: {
        orderBy: [
          { semester: 'asc' },
          { section: 'asc' }
        ]
      }
    }
  })

  const [studentCounts, instructors, subjectCounts] = await Promise.all([
    prisma.student.groupBy({
      by: ['department'],
      _count: { _all: true },
      where: { department: { not: null } }
    }),
    prisma.instructor.findMany({
      select: {
        department: true,
        departmentMemberships: {
          include: {
            department: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    }),
    prisma.subject.groupBy({
      by: ['department'],
      _count: { _all: true },
      where: { department: { not: null } }
    })
  ])

  const toCountMap = (groups) => groups.reduce((acc, group) => {
    if (group.department) {
      acc[group.department] = group._count._all
    }

    return acc
  }, {})

  const studentCountMap = toCountMap(studentCounts)
  const instructorCountMap = instructors.reduce((acc, instructor) => {
    getInstructorDepartments(instructor).forEach((departmentName) => {
      acc[departmentName] = (acc[departmentName] || 0) + 1
    })

    return acc
  }, {})
  const subjectCountMap = toCountMap(subjectCounts)

  const enriched = departments.map((department) => ({
    ...department,
    semesterSections: buildDepartmentSectionSummary(department.sections),
    _count: {
      students: studentCountMap[department.name] || 0,
      instructors: instructorCountMap[department.name] || 0,
      subjects: subjectCountMap[department.name] || 0
    }
  }))

  result.ok({ total: enriched.length, departments: enriched })
}

/**
 * Handles get public departments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getPublicDepartments = async (_req, result) => {
    const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true
    }
  })

  result.ok({ total: departments.length, departments })
}

/**
 * Handles update department business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateDepartment = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const name = normalizeDepartment(context.body.name)
  const code = normalizeDepartment(context.body.code).toUpperCase()
  const description = normalizeDepartment(context.body.description) || null

  const existing = await prisma.department.findUnique({ where: { id } })
  if (!existing) {
    return result.withStatus(404, { message: 'Department not found' })
  }

  if (!name || !code) {
    return result.withStatus(400, { message: 'Department name and code are required' })
  }

  const updated = await prisma.department.update({
    where: { id },
    data: { name, code, description }
  })

  result.ok({
    message: 'Department updated successfully!',
    department: updated
  })
}

/**
 * Handles delete department business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteDepartment = async (context, result = createServiceResponder()) => {
    const { id } = context.params

  const existing = await prisma.department.findUnique({ where: { id } })
  if (!existing) {
    return result.withStatus(404, { message: 'Department not found' })
  }

  const [students, instructors, subjects] = await Promise.all([
    prisma.student.count({ where: { department: existing.name } }),
    prisma.instructor.count({
      where: {
        OR: [
          { department: existing.name },
          {
            departmentMemberships: {
              some: {
                departmentId: existing.id
              }
            }
          }
        ]
      }
    }),
    prisma.subject.count({ where: { department: existing.name } })
  ])

  if (students > 0 || instructors > 0 || subjects > 0) {
    return result.withStatus(400, { message: 'Cannot delete a department that is still used by users or subjects' })
  }

  await prisma.department.delete({ where: { id } })

  result.ok({ message: 'Department deleted successfully!' })
}

/**
 * Handles get department sections business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getDepartmentSections = async (context, result = createServiceResponder()) => {
    const { id } = context.params
  const requestedSemester = Number.parseInt(String(context.query.semester || ''), 10)

  const department = await prisma.department.findUnique({
    where: { id },
    select: { id: true, name: true }
  })

  if (!department) {
    return result.withStatus(404, { message: 'Department not found' })
  }

  if (!canManageDepartment(context, department)) {
    return result.withStatus(403, { message: 'You can only manage sections in your own department' })
  }

  const where = {
    departmentId: department.id,
    ...(Number.isInteger(requestedSemester) ? { semester: requestedSemester } : {})
  }

  const sections = await prisma.departmentSection.findMany({
    where,
    orderBy: [
      { semester: 'asc' },
      { section: 'asc' }
    ]
  })

  result.ok({
    total: sections.length,
    sections
  })
}

/**
 * Handles create department section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createDepartmentSection = async (context, result = createServiceResponder()) => {
  try {
    const { id } = context.params
    const semester = Number.parseInt(String(context.body.semester || ''), 10)
    const section = normalizeSection(context.body.section)

    const department = await prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true }
    })

    if (!department) {
      return result.withStatus(404, { message: 'Department not found' })
    }

    if (!canManageDepartment(context, department)) {
      return result.withStatus(403, { message: 'You can only manage sections in your own department' })
    }

    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      return result.withStatus(400, { message: 'Semester must be between 1 and 8' })
    }

    if (!section || section.length > MAX_SECTION_LENGTH) {
      return result.withStatus(400, { message: `Section must be between 1 and ${MAX_SECTION_LENGTH} characters` })
    }

    const createdSection = await prisma.departmentSection.create({
      data: {
        departmentId: department.id,
        semester,
        section
      }
    })

    result.withStatus(201, {
      message: 'Department section created successfully!',
      section: createdSection
    })
  } catch (error) {
    if (error?.code === 'P2002') {
      return result.withStatus(400, { message: 'This section already exists for the selected semester' })
    }
    throw error
  }
}

/**
 * Handles delete department section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteDepartmentSection = async (context, result = createServiceResponder()) => {
    const { id, sectionId } = context.params

  const section = await prisma.departmentSection.findUnique({
    where: { id: sectionId },
    include: {
      department: {
        select: { id: true, name: true }
      }
    }
  })

  if (!section || section.departmentId !== id) {
    return result.withStatus(404, { message: 'Department section not found' })
  }

  if (!canManageDepartment(context, section.department)) {
    return result.withStatus(403, { message: 'You can only manage sections in your own department' })
  }

  await prisma.departmentSection.delete({
    where: { id: sectionId }
  })

  result.ok({ message: 'Department section deleted successfully!' })
}

module.exports = {
  createDepartment,
  getAllDepartments,
  getPublicDepartments,
  getDepartmentSections,
  createDepartmentSection,
  deleteDepartmentSection,
  updateDepartment,
  deleteDepartment,
  ensureDepartmentExists
}



