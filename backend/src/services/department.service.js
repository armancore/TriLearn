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

  const department = await prisma.department.findUnique({
    where: { name: normalized }
  })

  return department
}

const getCoordinatorDepartments = (req) => (
  req?.user?.role === 'COORDINATOR'
    ? normalizeDepartmentList([
      ...(Array.isArray(req.coordinator?.departments) ? req.coordinator.departments : []),
      req.coordinator?.department
    ])
    : []
)

const canManageDepartment = (req, department) => {
  if (!department) {
    return false
  }

  const coordinatorDepartments = getCoordinatorDepartments(req)
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
const createDepartment = async (req, response) => {
  try {
    const name = normalizeDepartment(req.body.name)
    const code = normalizeDepartment(req.body.code).toUpperCase()
    const description = normalizeDepartment(req.body.description) || null

    if (!name || !code) {
      return response.status(400).json({ message: 'Department name and code are required' })
    }

    const department = await prisma.department.create({
      data: { name, code, description }
    })

    response.status(201).json({
      message: 'Department created successfully!',
      department
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get all departments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getAllDepartments = async (req, response) => {
  try {
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

    response.json({ total: enriched.length, departments: enriched })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get public departments business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getPublicDepartments = async (_req, response) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true
      }
    })

    response.json({ total: departments.length, departments })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles update department business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const updateDepartment = async (req, response) => {
  try {
    const { id } = req.params
    const name = normalizeDepartment(req.body.name)
    const code = normalizeDepartment(req.body.code).toUpperCase()
    const description = normalizeDepartment(req.body.description) || null

    const existing = await prisma.department.findUnique({ where: { id } })
    if (!existing) {
      return response.status(404).json({ message: 'Department not found' })
    }

    if (!name || !code) {
      return response.status(400).json({ message: 'Department name and code are required' })
    }

    const updated = await prisma.department.update({
      where: { id },
      data: { name, code, description }
    })

    response.json({
      message: 'Department updated successfully!',
      department: updated
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles delete department business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteDepartment = async (req, response) => {
  try {
    const { id } = req.params

    const existing = await prisma.department.findUnique({ where: { id } })
    if (!existing) {
      return response.status(404).json({ message: 'Department not found' })
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
      return response.status(400).json({ message: 'Cannot delete a department that is still used by users or subjects' })
    }

    await prisma.department.delete({ where: { id } })

    response.json({ message: 'Department deleted successfully!' })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles get department sections business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const getDepartmentSections = async (req, response) => {
  try {
    const { id } = req.params
    const requestedSemester = Number.parseInt(String(req.query.semester || ''), 10)

    const department = await prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true }
    })

    if (!department) {
      return response.status(404).json({ message: 'Department not found' })
    }

    if (!canManageDepartment(req, department)) {
      return response.status(403).json({ message: 'You can only manage sections in your own department' })
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

    response.json({
      total: sections.length,
      sections
    })
  } catch (error) {
    response.internalError(error)
  }
}

/**
 * Handles create department section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const createDepartmentSection = async (req, response) => {
  try {
    const { id } = req.params
    const semester = Number.parseInt(String(req.body.semester || ''), 10)
    const section = normalizeSection(req.body.section)

    const department = await prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true }
    })

    if (!department) {
      return response.status(404).json({ message: 'Department not found' })
    }

    if (!canManageDepartment(req, department)) {
      return response.status(403).json({ message: 'You can only manage sections in your own department' })
    }

    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      return response.status(400).json({ message: 'Semester must be between 1 and 8' })
    }

    if (!section || section.length > MAX_SECTION_LENGTH) {
      return response.status(400).json({ message: `Section must be between 1 and ${MAX_SECTION_LENGTH} characters` })
    }

    const createdSection = await prisma.departmentSection.create({
      data: {
        departmentId: department.id,
        semester,
        section
      }
    })

    response.status(201).json({
      message: 'Department section created successfully!',
      section: createdSection
    })
  } catch (error) {
    if (error?.code === 'P2002') {
      return response.status(400).json({ message: 'This section already exists for the selected semester' })
    }
    response.internalError(error)
  }
}

/**
 * Handles delete department section business logic.
 * @param {...any} args - Service arguments.
 * @returns {Promise<any>|any} Service result.
 */
const deleteDepartmentSection = async (req, response) => {
  try {
    const { id, sectionId } = req.params

    const section = await prisma.departmentSection.findUnique({
      where: { id: sectionId },
      include: {
        department: {
          select: { id: true, name: true }
        }
      }
    })

    if (!section || section.departmentId !== id) {
      return response.status(404).json({ message: 'Department section not found' })
    }

    if (!canManageDepartment(req, section.department)) {
      return response.status(403).json({ message: 'You can only manage sections in your own department' })
    }

    await prisma.departmentSection.delete({
      where: { id: sectionId }
    })

    response.json({ message: 'Department section deleted successfully!' })
  } catch (error) {
    response.internalError(error)
  }
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



