/** @typedef {{ department?: string | null, departments?: string[], departmentMemberships?: {department?: {name?: string} | string, departmentName?: string}[] } | string | null | undefined | unknown[]} DepartmentSource */
const normalizeDepartmentValue = (/** @type {unknown} */ value) => String(value || '').trim()

const normalizeDepartmentList = (/** @type {unknown[]} */ values = []) => Array.from(new Set(
  values
    .map((value) => normalizeDepartmentValue(value))
    .filter(Boolean)
))

const getInstructorDepartments = (/** @type {DepartmentSource} */ instructorOrValue) => {
  if (Array.isArray(/** @type {DepartmentSource} */ instructorOrValue)) {
    return normalizeDepartmentList(/** @type {DepartmentSource} */ instructorOrValue)
  }

  if (instructorOrValue && typeof instructorOrValue === 'object') {
    const membershipDepartments = Array.isArray(instructorOrValue.departmentMemberships)
      ? instructorOrValue.departmentMemberships.map((membership) => (
        (typeof membership?.department === "object" ? membership.department?.name : undefined) || membership?.departmentName || membership?.department
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

const getPrimaryInstructorDepartment = (/** @type {DepartmentSource} */ instructorOrValue) => (
  getInstructorDepartments(/** @type {DepartmentSource} */ instructorOrValue)[0] || null
)

const instructorHasDepartment = (/** @type {DepartmentSource} */ instructorOrValue, /** @type {unknown} */ departmentValue) => {
  const normalizedDepartment = normalizeDepartmentValue(departmentValue)
  if (!normalizedDepartment) {
    return true
  }

  return getInstructorDepartments(/** @type {DepartmentSource} */ instructorOrValue)
    .some((department) => department.toLowerCase() === normalizedDepartment.toLowerCase())
}

module.exports = {
  getInstructorDepartments,
  getPrimaryInstructorDepartment,
  instructorHasDepartment,
  normalizeDepartmentList
}
