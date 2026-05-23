const normalizeDepartment = (department) => String(department || '').trim().toLowerCase()

const departmentsMatch = (left, right) => {
  const normalizedLeft = normalizeDepartment(left)
  const normalizedRight = normalizeDepartment(right)

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

module.exports = {
  normalizeDepartment,
  departmentsMatch
}
