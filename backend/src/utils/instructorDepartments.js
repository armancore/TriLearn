const normalizeDepartmentValue = (value) => String(value || '').trim()

const normalizeDepartmentList = (values = []) => Array.from(new Set(
  values
    .map((value) => normalizeDepartmentValue(value))
    .filter(Boolean)
))

const getInstructorDepartments = (instructorOrValue) => {
  if (Array.isArray(instructorOrValue)) {
    return normalizeDepartmentList(instructorOrValue)
  }

  if (instructorOrValue && typeof instructorOrValue === 'object') {
    const membershipDepartments = Array.isArray(instructorOrValue.departmentMemberships)
      ? instructorOrValue.departmentMemberships.map((membership) => (
        membership?.department?.name || membership?.departmentName || membership?.department
      ))
      : []

    if (membershipDepartments.length > 0) {
      return normalizeDepartmentList(membershipDepartments)
    }

    const multiDepartments = Array.isArray(instructorOrValue.departments)
      ? instructorOrValue.departments
      : []

    if (multiDepartments.length > 0) {
      return normalizeDepartmentList(multiDepartments)
    }

    return normalizeDepartmentList([instructorOrValue.department])
  }

  return normalizeDepartmentList([instructorOrValue])
}

const getPrimaryInstructorDepartment = (instructorOrValue) => (
  getInstructorDepartments(instructorOrValue)[0] || null
)

const instructorHasDepartment = (instructorOrValue, departmentValue) => {
  const normalizedDepartment = normalizeDepartmentValue(departmentValue)
  if (!normalizedDepartment) {
    return true
  }

  return getInstructorDepartments(instructorOrValue)
    .some((department) => department.toLowerCase() === normalizedDepartment.toLowerCase())
}

module.exports = {
  getInstructorDepartments,
  getPrimaryInstructorDepartment,
  instructorHasDepartment,
  normalizeDepartmentList
}
