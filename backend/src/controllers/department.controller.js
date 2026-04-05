const prisma = require('../utils/prisma')

const normalizeDepartment = (value) => value ? value.trim() : ''

const ensureDepartmentExists = async (departmentName) => {
  const normalized = normalizeDepartment(departmentName)
  if (!normalized) return null

  const department = await prisma.department.findUnique({
    where: { name: normalized }
  })

  return department
}

const createDepartment = async (req, res) => {
  try {
    const name = normalizeDepartment(req.body.name)
    const code = normalizeDepartment(req.body.code).toUpperCase()
    const description = normalizeDepartment(req.body.description) || null

    if (!name || !code) {
      return res.status(400).json({ message: 'Department name and code are required' })
    }

    const department = await prisma.department.create({
      data: { name, code, description }
    })

    res.status(201).json({
      message: 'Department created successfully!',
      department
    })
  } catch (error) {
    res.internalError(error)
  }
}

const getAllDepartments = async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' }
    })

    const [studentCounts, instructorCounts, subjectCounts] = await Promise.all([
      prisma.student.groupBy({
        by: ['department'],
        _count: { _all: true },
        where: { department: { not: null } }
      }),
      prisma.instructor.groupBy({
        by: ['department'],
        _count: { _all: true },
        where: { department: { not: null } }
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
    const instructorCountMap = toCountMap(instructorCounts)
    const subjectCountMap = toCountMap(subjectCounts)

    const enriched = departments.map((department) => ({
      ...department,
      _count: {
        students: studentCountMap[department.name] || 0,
        instructors: instructorCountMap[department.name] || 0,
        subjects: subjectCountMap[department.name] || 0
      }
    }))

    res.json({ total: enriched.length, departments: enriched })
  } catch (error) {
    res.internalError(error)
  }
}

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params
    const name = normalizeDepartment(req.body.name)
    const code = normalizeDepartment(req.body.code).toUpperCase()
    const description = normalizeDepartment(req.body.description) || null

    const existing = await prisma.department.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ message: 'Department not found' })
    }

    if (!name || !code) {
      return res.status(400).json({ message: 'Department name and code are required' })
    }

    const updated = await prisma.department.update({
      where: { id },
      data: { name, code, description }
    })

    res.json({
      message: 'Department updated successfully!',
      department: updated
    })
  } catch (error) {
    res.internalError(error)
  }
}

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.department.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ message: 'Department not found' })
    }

    const [students, instructors, subjects] = await Promise.all([
      prisma.student.count({ where: { department: existing.name } }),
      prisma.instructor.count({ where: { department: existing.name } }),
      prisma.subject.count({ where: { department: existing.name } })
    ])

    if (students > 0 || instructors > 0 || subjects > 0) {
      return res.status(400).json({ message: 'Cannot delete a department that is still used by users or subjects' })
    }

    await prisma.department.delete({ where: { id } })

    res.json({ message: 'Department deleted successfully!' })
  } catch (error) {
    res.internalError(error)
  }
}

module.exports = {
  createDepartment,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
  ensureDepartmentExists
}


