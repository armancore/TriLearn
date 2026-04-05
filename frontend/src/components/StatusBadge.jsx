const variants = {
  PRESENT: 'bg-primary-100 text-primary',
  ABSENT: 'bg-accent-100 text-accent-700',
  LATE: 'bg-accent-100 text-accent-700',
  SUBMITTED: 'bg-primary-100 text-primary',
  GRADED: 'bg-primary-100 text-primary',
  ADMIN: 'bg-primary-100 text-primary',
  INSTRUCTOR: 'bg-primary-100 text-primary',
  STUDENT: 'bg-primary-100 text-primary',
  GATEKEEPER: 'bg-accent-100 text-accent-700',
  GENERAL: 'bg-[var(--color-surface-muted)] text-[var(--color-page-text)]',
  EXAM: 'bg-accent-100 text-accent-700',
  URGENT: 'bg-accent-100 text-accent-700',
  EVENT: 'bg-primary-100 text-primary',
  HOLIDAY: 'bg-primary-100 text-primary',
  INTERNAL: 'bg-primary-100 text-primary',
  MIDTERM: 'bg-primary-100 text-primary',
  FINAL: 'bg-accent-100 text-accent-700',
  PRACTICAL: 'bg-primary-100 text-primary',
  ACTIVE: 'bg-primary-100 text-primary',
  DISABLED: 'bg-accent-100 text-accent-700'
}

const StatusBadge = ({ status }) => (
  <span className={`text-xs px-2 py-1 rounded-full font-medium ${variants[status] || 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'}`}>
    {status}
  </span>
)

export default StatusBadge
