const variants = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  LATE: 'bg-orange-100 text-orange-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  GRADED: 'bg-green-100 text-green-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  INSTRUCTOR: 'bg-purple-100 text-purple-700',
  STUDENT: 'bg-green-100 text-green-700',
  GATEKEEPER: 'bg-amber-100 text-amber-700',
  GENERAL: 'bg-gray-100 text-gray-700',
  EXAM: 'bg-red-100 text-red-700',
  URGENT: 'bg-orange-100 text-orange-700',
  EVENT: 'bg-blue-100 text-blue-700',
  HOLIDAY: 'bg-green-100 text-green-700',
  INTERNAL: 'bg-blue-100 text-blue-700',
  MIDTERM: 'bg-purple-100 text-purple-700',
  FINAL: 'bg-red-100 text-red-700',
  PRACTICAL: 'bg-green-100 text-green-700',
  ACTIVE: 'bg-green-100 text-green-700',
  DISABLED: 'bg-red-100 text-red-700'
}

const StatusBadge = ({ status }) => (
  <span className={`text-xs px-2 py-1 rounded-full font-medium ${variants[status] || 'bg-gray-100 text-gray-600'}`}>
    {status}
  </span>
)

export default StatusBadge
