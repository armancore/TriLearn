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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

const getAllDepartments = async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' }
    })

    const enriched = await Promise.all(
      departments.map(async (department) => {
        const [students, instructors, subjects] = await Promise.all([
          prisma.student.count({ where: { department: department.name } }),
          prisma.instructor.count({ where: { department: department.name } }),
          prisma.subject.count({ where: { department: department.name } })
        ])

        return {
          ...department,
          _count: { students, instructors, subjects }
        }
      })
    )

    res.json({ total: enriched.length, departments: enriched })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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

    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({
        where: { id },
        data: { name, code, description }
      })

      if (existing.name !== name) {
        await Promise.all([
          tx.student.updateMany({ where: { department: existing.name }, data: { department: name } }),
          tx.instructor.updateMany({ where: { department: existing.name }, data: { department: name } }),
          tx.subject.updateMany({ where: { department: existing.name }, data: { department: name } })
        ])
      }

      return department
    })

    res.json({
      message: 'Department updated successfully!',
      department: updated
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
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
    console.error(error)
    res.status(500).json({ message: 'Something went wrong', error: error.message })
  }
}

module.exports = {
  createDepartment,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
  ensureDepartmentExists
}
