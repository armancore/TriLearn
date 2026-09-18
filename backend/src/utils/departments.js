const normalizeDepartment = (/** @type {unknown} */ department) => String(department || '').trim().toLowerCase()

const departmentsMatch = (/** @type {unknown} */ left, /** @type {unknown} */ right) => {
  const normalizedLeft = normalizeDepartment(left)
  const normalizedRight = normalizeDepartment(right)

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

module.exports = {
  normalizeDepartment,
  departmentsMatch
}
