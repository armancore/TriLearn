import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, Power, Trash2, Upload, UserPlus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import useForm from '../../hooks/useForm'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
const initialUserValues = {
  name: '',
  email: '',
  password: '',
  studentId: '',
  phone: '',
  department: '',
  departments: [],
  semester: '1',
  section: ''
}

const allVisibleRoles = ['', 'ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']
const coordinatorVisibleRoles = ['', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']
const getInstructorDepartments = (instructor) => (
  Array.isArray(instructor?.departments) && instructor.departments.length > 0
    ? instructor.departments
    : [instructor?.department].filter(Boolean)
)

const Users = () => {
  const { user: currentUser } = useAuth()
  const { departments, loadDepartments } = useReferenceData()
  const isCoordinator = currentUser?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('instructor')
  const [userToDelete, setUserToDelete] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importingStudents, setImportingStudents] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const [filterRole, setFilterRole] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)
  const visibleRoles = isCoordinator ? coordinatorVisibleRoles : allVisibleRoles
  const validateUserForm = (values) => {
    const validationErrors = {}

    if (!values.name.trim()) validationErrors.name = 'Name is required'
    if (modalType === 'student') {
      if (!values.email.trim()) validationErrors.email = 'Personal email is required'
      else if (!/\S+@\S+\.\S+/.test(values.email)) validationErrors.email = 'Enter a valid personal email address'
      if (!values.studentId.trim()) validationErrors.studentId = 'Student ID is required'
    } else {
      if (!values.email.trim()) validationErrors.email = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(values.email)) validationErrors.email = 'Enter a valid email address'
      if (!values.password) validationErrors.password = 'Password is required'
      else if (values.password.length < 8) validationErrors.password = 'Password must be at least 8 characters'
      else if (!/[A-Z]/.test(values.password)) validationErrors.password = 'Password must include at least one uppercase letter'
      else if (!/[a-z]/.test(values.password)) validationErrors.password = 'Password must include at least one lowercase letter'
      else if (!/[0-9]/.test(values.password)) validationErrors.password = 'Password must include at least one number'
    }

    if (modalType === 'instructor' && (!Array.isArray(values.departments) || values.departments.length === 0)) {
      validationErrors.department = 'Select at least one department'
    } else if (modalType !== 'gatekeeper' && modalType !== 'instructor' && !values.department.trim()) {
      validationErrors.department = 'Department is required'
    }

    if (modalType === 'student') {
      const semester = parseInt(values.semester, 10)
      if (Number.isNaN(semester) || semester < 1 || semester > 8) {
        validationErrors.semester = 'Semester must be between 1 and 8'
      }
      if (!values.section.trim()) {
        validationErrors.section = 'Section is required'
      }
    }

    return validationErrors
  }
  const { values, errors, handleChange, handleSubmit, setValues, setErrors } = useForm(initialUserValues, validateUserForm)

  const handleInstructorDepartmentToggle = (departmentName) => {
    setValues((current) => {
      const selectedDepartments = Array.isArray(current.departments) ? current.departments : []
      const nextDepartments = selectedDepartments.includes(departmentName)
        ? selectedDepartments.filter((item) => item !== departmentName)
        : [...selectedDepartments, departmentName]

      return {
        ...current,
        departments: nextDepartments
      }
    })

    if (errors.department) {
      setErrors((current) => ({ ...current, department: '' }))
    }
  }

  useEffect(() => {
    setPage(1)
  }, [filterRole, debouncedSearchTerm])

  useEffect(() => {
    void loadDepartments().catch((fetchError) => {
      logger.error('Failed to load departments', fetchError)
    })
  }, [loadDepartments])

  const fetchUsers = useCallback(async (signal) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      })

      if (filterRole) {
        params.set('role', filterRole)
      }
      if (debouncedSearchTerm.trim()) {
        params.set('search', debouncedSearchTerm.trim())
      }

      const res = await api.get(`/admin/users?${params.toString()}`, { signal })
      setUsers(res.data.users)
      setTotal(res.data.total)
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error(error)
      setError(getFriendlyErrorMessage(error, 'Unable to load users right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [debouncedSearchTerm, filterRole, limit, page])

  useEffect(() => {
    const controller = new AbortController()
    void fetchUsers(controller.signal)
    return () => controller.abort()
  }, [fetchUsers])

  const handleCreateUser = async () => {
    setError('')
    try {
      const endpoint = modalType === 'coordinator'
        ? '/admin/users/coordinator'
        : modalType === 'instructor'
          ? '/admin/users/instructor'
          : modalType === 'gatekeeper'
            ? '/admin/users/gatekeeper'
            : '/admin/users/student'
      const payload = modalType === 'student'
        ? {
            name: values.name,
            email: values.email,
            studentId: values.studentId,
            phone: values.phone,
            address: '',
            department: values.department,
            semester: parseInt(values.semester, 10),
            section: values.section
          }
        : {
            name: values.name,
            email: values.email,
            password: values.password,
            phone: values.phone,
            address: '',
            department: modalType === 'gatekeeper'
              ? undefined
              : modalType === 'instructor'
                ? undefined
                : values.department,
            departments: modalType === 'instructor' ? values.departments : undefined
          }
      const res = await api.post(endpoint, {
        ...payload
      })
      if (modalType === 'student') {
        const loginEmail = res.data.user?.email
        showToast({
          title: 'Student account created.',
          description: res.data.welcomeEmailSent
            ? `Login email: ${loginEmail}. Temporary login instructions were sent by email.`
            : `Login email: ${loginEmail}. The account was created, but the welcome email could not be delivered.`
        })
      } else {
        showToast({ title: `${modalType} created successfully.` })
      }
      setFilterRole(modalType === 'student' ? 'STUDENT' : modalType === 'instructor' ? 'INSTRUCTOR' : modalType === 'gatekeeper' ? 'GATEKEEPER' : '')
      setSearchTerm('')
      setPage(1)
      setShowModal(false)
      setValues({
        ...initialUserValues
      })
      setErrors({})
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to create the user right now.'))
    }
  }

  const handleToggleStatus = async (id, currentStatus) => {
    const previousUsers = users
    const nextStatus = !currentStatus
    try {
      setUsers((current) => current.map((user) => (
        user.id === id ? { ...user, isActive: nextStatus } : user
      )))
      await api.patch(`/admin/users/${id}/toggle-status`)
      showToast({ title: `User ${nextStatus ? 'enabled' : 'disabled'} successfully.` })
    } catch (err) {
      setUsers(previousUsers)
      setError(getFriendlyErrorMessage(err, 'Unable to update the user right now.'))
    }
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    const previousUsers = users
    const previousTotal = total
    try {
      setDeletingUser(true)
      const target = userToDelete
      setUserToDelete(null)
      setUsers((current) => current.filter((user) => user.id !== target.id))
      setTotal((current) => Math.max(0, current - 1))
      await api.delete(`/admin/users/${target.id}`)
      showToast({ title: 'User deleted successfully.' })
    } catch (err) {
      setUsers(previousUsers)
      setTotal(previousTotal)
      setError(getFriendlyErrorMessage(err, 'Unable to delete the user right now.'))
    } finally {
      setDeletingUser(false)
    }
  }

  const openModal = (type) => {
    setModalType(type)
    setError('')
    setValues({
      ...initialUserValues
    })
    setErrors({})
    setShowModal(true)
  }

  const openImportModal = () => {
    setError('')
    setImportFile(null)
    setImportResult(null)
    setShowImportModal(true)
  }

  const handleImportStudents = async () => {
    if (!importFile) {
      setError('Please choose a CSV or XLSX file to import.')
      return
    }

    const formData = new FormData()
    formData.append('file', importFile)

    try {
      setImportingStudents(true)
      setError('')
      const response = await api.post('/admin/users/student-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setImportResult(response.data)
      await fetchUsers()
      showToast({
        title: 'Student import completed.',
        description: `${response.data.summary?.created || 0} students created, ${response.data.summary?.failed || 0} rows failed.`,
        type: 'success',
        duration: 5000
      })
    } catch (requestError) {
      setImportResult(requestError?.response?.data || null)
      setError(getFriendlyErrorMessage(requestError, 'Unable to import students right now.'))
    } finally {
      setImportingStudents(false)
    }
  }

  const canToggleStatus = (targetUser) => {
    if (!targetUser || targetUser.id === currentUser?.id) {
      return false
    }

    if (!isCoordinator) {
      return true
    }

    return true
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">

        <PageHeader
          title="Users"
          subtitle={isCoordinator ? 'Manage users across the campus with admin-style access.' : 'Manage all users in TriLearn'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Users']}
          actions={[
            ...(isCoordinator
              ? [
                  { label: 'Add Instructor', icon: UserPlus, variant: 'primary', onClick: () => openModal('instructor') },
                  { label: 'Add Gate Account', icon: UserPlus, variant: 'primary', onClick: () => openModal('gatekeeper') },
                  { label: 'Import Students', icon: Upload, variant: 'secondary', onClick: openImportModal }
                ]
              : [
                  { label: 'Add Coordinator', icon: UserPlus, variant: 'primary', onClick: () => openModal('coordinator') },
                  { label: 'Add Instructor', icon: UserPlus, variant: 'primary', onClick: () => openModal('instructor') },
                  { label: 'Add Gate Account', icon: UserPlus, variant: 'primary', onClick: () => openModal('gatekeeper') },
                  { label: 'Import Students', icon: Upload, variant: 'secondary', onClick: openImportModal }
                ]),
            { label: 'Add Student', icon: UserPlus, variant: 'primary', onClick: () => openModal('student') }
          ]}
        />

        {/* Success/Error messages */}
        <Alert type="error" message={error} />

        {/* Filter */}
        <div className="mb-6 space-y-4">
          {!isCoordinator ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">Bulk student import</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">Upload a CSV or XLSX file with `name`, `email`, `studentId`, `department`, `semester`, and `section`. `phone` and `address` are optional.</p>
                </div>
                <button
                  type="button"
                  onClick={openImportModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-heading)] transition hover:bg-[var(--color-surface-subtle)]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Upload roster</span>
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
            <label className="mb-2 block text-sm font-medium text-[var(--color-page-text)]">Search users</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, phone, roll number, or department"
              className="w-full rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm text-[var(--color-page-text)] focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {visibleRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setFilterRole(role)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition
                  ${filterRole === role
                    ? 'bg-primary text-white'
                    : 'border border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
                  }`}
              >
                {role || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
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
                    icon="👥"
                    title="No users found"
                    description={filterRole === 'INSTRUCTOR'
                      ? 'No instructors matched this filter yet. Create one to get started.'
                      : filterRole === 'COORDINATOR'
                        ? 'No coordinators matched this filter yet.'
                      : filterRole === 'STUDENT'
                        ? 'No students matched this filter yet. Add a student or change the filter.'
                        : 'Try a different role filter or create a new account for your campus.'}
                    action={(
                      <button
                        type="button"
                        onClick={() => openModal(filterRole === 'INSTRUCTOR' ? 'instructor' : 'student')}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>{filterRole === 'INSTRUCTOR' ? 'Add Instructor' : 'Add Student'}</span>
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
                  <tr className="text-left text-sm text-[--color-text-muted] dark:text-slate-400">
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
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[var(--color-heading)]">{user.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{user.phone || user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-[--color-text-muted] dark:text-slate-400 text-sm">{user.email}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={user.role} />
                      </td>
                      <td className="px-6 py-4 text-sm text-[--color-text-muted] dark:text-slate-400">
                        {user.student && `Sem ${user.student.semester} · ${user.student.rollNumber}`}
                        {user.instructor && `${getInstructorDepartments(user.instructor).join(', ') || 'No dept'}`}
                        {user.coordinator && `${user.coordinator.department || 'No dept'} coordinator`}
                        {user.role === 'GATEKEEPER' && 'Gate QR operator'}
                        {user.admin && 'Administrator'}
                        {user.mustChangePassword && ' · Password reset pending'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={user.isActive ? 'ACTIVE' : 'DISABLED'} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {canToggleStatus(user) ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user.id, user.isActive)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition
                                ${user.isActive
                                  ? 'bg-accent-100 text-accent-700 hover:bg-accent-200'
                                  : 'bg-primary-100 text-primary hover:bg-primary-200'
                                }`}
                              aria-label={user.isActive ? `Disable ${user.name}` : `Enable ${user.name}`}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                          ) : null}
                          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR') && (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700 transition hover:bg-accent-200"
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

      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={`Add ${modalType === 'coordinator' ? 'Coordinator' : modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}`}
          onClose={() => setShowModal(false)}
        >
            <Alert type="error" message={error} />

            <form onSubmit={handleSubmit(handleCreateUser)} className="space-y-4">
              <div>
                <label className="ui-form-label">Full Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  value={values.name}
                  onChange={handleChange}
                  className={`ui-form-input ${errors.name ? 'ui-form-input-error' : ''}`}
                />
                {errors.name && <p className="ui-form-helper-error">{errors.name}</p>}
              </div>
              {modalType === 'student' ? (
                <>
                  <div>
                    <label className="ui-form-label">Student Personal Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      value={values.email}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="ui-form-label">Student ID / Roll Number</label>
                    <input
                      name="studentId"
                      type="text"
                      required
                      value={values.studentId}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.studentId ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.studentId && <p className="ui-form-helper-error">{errors.studentId}</p>}
                  </div>
                  <div className="rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary dark:bg-primary-950/30 dark:text-primary-300">
                    The student will sign in using their personal email address and will be forced to change the default password on first login.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="ui-form-label">Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      value={values.email}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="ui-form-label">Password</label>
                    <input
                      name="password"
                      type="password"
                      required
                      value={values.password}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.password ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.password && <p className="ui-form-helper-error">{errors.password}</p>}
                  </div>
                  <p className="text-xs text-[--color-text-muted] dark:text-slate-400">
                    Use at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                </>
              )}
              <div>
                <label className="ui-form-label">Phone</label>
                <input
                  name="phone"
                  type="text"
                  placeholder="Optional"
                  value={values.phone}
                  onChange={handleChange}
                  className="ui-form-input"
                />
              </div>
              {modalType === 'instructor' ? (
                <div>
                  <label className="ui-form-label">Departments</label>
                  <div className="grid gap-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3 sm:grid-cols-2">
                    {departments.map((department) => {
                      const checked = values.departments.includes(department.name)

                      return (
                        <label key={department.id} className="flex items-center gap-3 rounded-lg bg-[var(--color-card-surface)] px-3 py-2 text-sm text-[var(--color-heading)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleInstructorDepartmentToggle(department.name)}
                            className="h-4 w-4 accent-[var(--color-role-accent)]"
                          />
                          <span>{department.name} ({department.code})</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-soft)]">Select every department this instructor teaches, such as `BIT` and `BCS`.</p>
                  {errors.department && <p className="ui-form-helper-error">{errors.department}</p>}
                </div>
              ) : modalType !== 'gatekeeper' && (
                <div>
                  <label className="ui-form-label">Department</label>
                  <select
                    name="department"
                    value={values.department}
                    onChange={handleChange}
                    className={`ui-form-input ${errors.department ? 'ui-form-input-error' : ''}`}
                  >
                    <option value="">Select Department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                  </select>
                  {errors.department && <p className="ui-form-helper-error">{errors.department}</p>}
                </div>
              )}

              {modalType === 'student' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="ui-form-label">Semester</label>
                    <input
                      name="semester"
                      type="number"
                      min="1"
                      max="8"
                      value={values.semester}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.semester ? 'ui-form-input-error' : ''}`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="ui-form-label">Section</label>
                    <input
                      name="section"
                      type="text"
                      value={values.section}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.section ? 'ui-form-input-error' : ''}`}
                    />
                  </div>
                </div>
              )}
              {modalType === 'student' && errors.semester && <p className="ui-form-helper-error">{errors.semester}</p>}
              {modalType === 'student' && errors.section && <p className="ui-form-helper-error">{errors.section}</p>}

              <div className="ui-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-400 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary font-medium"
                >
                  Create {modalType === 'coordinator' ? 'Coordinator' : modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {showImportModal && (
        <Modal
          title="Import Students"
          onClose={() => {
            if (!importingStudents) {
              setShowImportModal(false)
            }
          }}
        >
          <Alert type="error" message={error} />

          <div className="space-y-4">
            <div className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
              Use a CSV or XLSX file with these columns: `name`, `email`, `studentId`, `department`, `semester`, `section`.
              Optional columns: `phone`, `address`. Department can match either the department name or code.
            </div>

            <label className="ui-form-file">
              <input
                type="file"
                accept=".csv,.xlsx"
                className="ui-form-file-input"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null
                  setImportFile(nextFile)
                  setImportResult(null)
                }}
              />
              <span>{importFile ? `${importFile.name} selected` : 'Choose a CSV or XLSX file'}</span>
            </label>

            {importResult?.summary ? (
              <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-soft)]">Processed</p>
                    <p className="mt-2 text-2xl font-black text-[var(--color-heading)]">{importResult.summary.processed || 0}</p>
                  </div>
                  <div className="rounded-xl bg-primary-50 px-4 py-3 dark:bg-primary-950/20">
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">Created</p>
                    <p className="mt-2 text-2xl font-black text-primary">{importResult.summary.created || 0}</p>
                  </div>
                  <div className="rounded-xl bg-accent-50 px-4 py-3 dark:bg-accent-950/20">
                    <p className="text-xs uppercase tracking-[0.2em] text-accent-700 dark:text-accent-300">Failed</p>
                    <p className="mt-2 text-2xl font-black text-accent-700 dark:text-accent-300">{importResult.summary.failed || 0}</p>
                  </div>
                </div>

                {Array.isArray(importResult.created) && importResult.created.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Created accounts</p>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[var(--color-surface-muted)] p-3">
                      {importResult.created.map((student) => (
                        <div key={`${student.rowNumber}-${student.studentId}`} className="rounded-lg bg-[var(--color-card-surface)] px-3 py-3 text-sm">
                          <p className="font-semibold text-[var(--color-heading)]">{student.name} · {student.studentId}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">{student.email}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">
                            Welcome email: <span className="font-medium text-[var(--color-heading)]">{student.welcomeEmailSent ? 'Sent' : 'Pending / failed'}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(importResult.failures) && importResult.failures.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Failed rows</p>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[var(--color-surface-muted)] p-3">
                      {importResult.failures.map((failure) => (
                        <div key={`${failure.rowNumber}-${failure.studentId || failure.email || failure.message}`} className="rounded-lg bg-[var(--color-card-surface)] px-3 py-3 text-sm">
                          <p className="font-semibold text-[var(--color-heading)]">Row {failure.rowNumber}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">{failure.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="ui-modal-footer">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={importingStudents}
                className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-400 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900 disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleImportStudents()
                }}
                disabled={!importFile || importingStudents}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary font-medium disabled:opacity-60"
              >
                {importingStudents ? 'Importing...' : 'Import Students'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!userToDelete}
        title="Delete User"
        message={userToDelete
          ? `Delete ${userToDelete.name}? This action permanently removes the account and related profile data.`
          : ''}
        confirmText="Delete User"
        busy={deletingUser}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default Users



