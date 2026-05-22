import { Link } from 'react-router-dom'
import { ArrowUpCircle, PencilLine, Power, Search, Trash2, UserPlus } from 'lucide-react'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../context/AuthContext'
import EmptyState from '../EmptyState'
import LoadingSkeleton from '../LoadingSkeleton'
import Pagination from '../Pagination'
import StatusBadge from '../StatusBadge'

const getInstructorDepartments = (instructor) => (
  Array.isArray(instructor?.departments) && instructor.departments.length > 0
    ? instructor.departments
    : [instructor?.department].filter(Boolean)
)

const getStudentDetails = (student) => {
  if (!student) {
    return ''
  }

  const academicLabel = student.isGraduated
    ? `Graduate${student.graduationYear ? ` ${student.graduationYear}` : ''}`
    : `Sem ${student.semester}`

  return `${academicLabel} · ${student.rollNumber}`
}

const UserTable = ({
  loading,
  users,
  total,
  page,
  limit,
  setPage,
  filterRole,
  openModal,
  studentsOnPage,
  selectedStudentIds,
  handleToggleAllStudentsOnPage,
  handleToggleStudentSelection,
  openStudentSectionModal,
  setStudentToPromote,
  canToggleStatus,
  handleToggleStatus,
  currentUser,
  setUserToDelete
}) => {
  const { user: currentUserAuth } = useAuth()
  const role = currentUserAuth?.role

  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/50">
    {loading ? (
      <div className="p-6">
        <LoadingSkeleton rows={6} itemClassName="h-16" />
      </div>
    ) : (
      <>
        {users.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={UserPlus}
              title="No users found"
              description={filterRole === ROLES.INSTRUCTOR
                ? 'No instructors matched this filter yet. Create one to get started.'
                : filterRole === ROLES.COORDINATOR
                  ? 'No coordinators matched this filter yet.'
                : filterRole === ROLES.STUDENT
                  ? 'No students matched this filter yet. Add a student or change the filter.'
                  : 'Try a different role filter or create a new account for your campus.'}
              action={(
                <button
                  type="button"
                  onClick={() => openModal(filterRole === ROLES.STUDENT ? 'student' : filterRole === ROLES.GATEKEEPER ? 'gatekeeper' : filterRole === ROLES.COORDINATOR ? 'coordinator' : 'instructor')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{filterRole === ROLES.STUDENT ? 'Add Student' : filterRole === ROLES.GATEKEEPER ? 'Add Gate Account' : filterRole === ROLES.COORDINATOR ? 'Add Coordinator' : 'Add Instructor'}</span>
                </button>
              )}
            />
          </div>
        ) : (
        <>
        <div className="flex items-center justify-between border-b border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-heading)]">Directory</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Manage account access, roles, and user status.</p>
          </div>
          <span className="ui-status-badge ui-status-neutral">{total} records</span>
        </div>
        <div className="overflow-x-auto max-h-[720px]">
        <table className="w-full min-w-[840px]">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-muted)]">
            <tr className="text-left text-sm text-[--color-text-muted] dark:text-slate-300">
              <th scope="col" className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={studentsOnPage.length > 0 && studentsOnPage.every((student) => selectedStudentIds.includes(student.id))}
                  onChange={handleToggleAllStudentsOnPage}
                  className="h-4 w-4 accent-[var(--color-role-accent)]"
                  aria-label="Select all students on this page"
                />
              </th>
              <th scope="col" className="px-6 py-4">Name</th>
              <th scope="col" className="px-6 py-4">Email</th>
              <th scope="col" className="px-6 py-4">Role</th>
              <th scope="col" className="px-6 py-4">Details</th>
              <th scope="col" className="px-6 py-4">Status</th>
              <th scope="col" className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-[var(--color-card-border)] transition-colors hover:bg-primary-50/30 dark:hover:bg-primary-950/15">
                <td className="px-4 py-4">
                  {user.student ? (
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(user.id)}
                      onChange={() => handleToggleStudentSelection(user.id)}
                      className="h-4 w-4 accent-[var(--color-role-accent)]"
                      aria-label={`Select ${user.name}`}
                    />
                  ) : null}
                </td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-[var(--color-heading)]">{user.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{user.phone || user.email}</p>
                </td>
                <td className="px-6 py-4 text-[--color-text-muted] dark:text-slate-300 text-sm">{user.email}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={user.role} />
                </td>
                <td className="px-6 py-4 text-sm text-[--color-text-muted] dark:text-slate-300">
                  {user.student && getStudentDetails(user.student)}
                  {user.instructor && `${getInstructorDepartments(user.instructor).join(', ') || 'No dept'}`}
                  {user.coordinator && `${user.coordinator.department || 'No dept'} coordinator`}
                  {user.role === ROLES.GATEKEEPER && 'Gate QR operator'}
                  {user.admin && 'Administrator'}
                  {user.mustChangePassword && ' · Password reset pending'}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={user.isActive ? 'ACTIVE' : 'DISABLED'} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {user.role === ROLES.STUDENT && (
                      <Link
                        to={
                          role === 'ADMIN'
                            ? `/admin/students/${user.student?.id}/profile`
                            : `/coordinator/students/${user.student?.id}/profile`
                        }
                        className="inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                        title="View student profile"
                      >
                        <Search className="h-4 w-4" />
                      </Link>
                    )}
                    {user.student ? (
                      <button
                        type="button"
                        onClick={() => openStudentSectionModal(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        aria-label={`Update ${user.name} student details`}
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                    ) : null}
                    {user.student && !user.student.isGraduated ? (
                      <button
                        type="button"
                        onClick={() => setStudentToPromote(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary transition hover:bg-primary-200 dark:bg-primary-900/35 dark:text-primary-200 dark:hover:bg-primary-900/50"
                        aria-label={Number(user.student.semester) >= 8
                          ? `Mark ${user.name} as graduated`
                          : `Promote ${user.name} to semester ${Number(user.student.semester) + 1}`}
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                    {canToggleStatus(user) ? (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user.id, user.isActive)}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition
                          ${user.isActive
                            ? 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/35 dark:text-accent-200 dark:hover:bg-accent-900/50'
                            : 'bg-primary-100 text-primary hover:bg-primary-200 dark:bg-primary-900/35 dark:text-primary-200 dark:hover:bg-primary-900/50'
                          }`}
                        aria-label={user.isActive ? `Disable ${user.name}` : `Enable ${user.name}`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    ) : null}
                    {(currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.COORDINATOR) && (
                      <button
                        type="button"
                        onClick={() => setUserToDelete(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700 transition hover:bg-accent-200 dark:bg-accent-900/35 dark:text-accent-200 dark:hover:bg-accent-900/50"
                        aria-label={`Delete ${user.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </>
        )}
        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
      </>
    )}
  </div>
  )
}

export default UserTable
