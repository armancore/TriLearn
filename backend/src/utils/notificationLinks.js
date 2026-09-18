const inferNoticeLink = (/** @type {string} */ role) => (
  role === 'STUDENT'
    ? '/student/notices'
    : role === 'INSTRUCTOR'
      ? '/instructor/notices'
      : role === 'COORDINATOR'
        ? '/coordinator/notices'
        : '/admin/notices'
)

const inferRoutineLink = (/** @type {string} */ role) => (
  role === 'STUDENT'
    ? '/student/routine'
    : role === 'INSTRUCTOR'
      ? '/instructor/routine'
      : role === 'COORDINATOR'
        ? '/coordinator/routine/view'
        : '/admin/routine/view'
)

module.exports = {
  inferNoticeLink,
  inferRoutineLink
}
