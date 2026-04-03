import { useState, useEffect } from 'react'
import { Power, Trash2, UserPlus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import LoadingSpinner from '../../components/LoadingSpinner'
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
import logger from '../../utils/logger'
const initialUserValues = {
  name: '',
  email: '',
  password: '',
  studentId: '',
  phone: '',
  department: '',
  semester: '1',
  section: ''
}

const coordinatorVisibleRoles = ['', 'INSTRUCTOR', 'STUDENT']
const allVisibleRoles = ['', 'ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']

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

    if (modalType !== 'gatekeeper' && !values.department.trim()) {
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

  useEffect(() => {
    fetchUsers()
  }, [filterRole, page, debouncedSearchTerm])

  useEffect(() => {
    setPage(1)
  }, [filterRole, debouncedSearchTerm])

  useEffect(() => {
    void loadDepartments().catch((fetchError) => {
      logger.error('Failed to load departments', fetchError)
    })
  }, [loadDepartments])

  const fetchUsers = async () => {
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

      const res = await api.get(`/admin/users?${params.toString()}`)
      setUsers(res.data.users)
      setTotal(res.data.total)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
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
            department: modalType === 'gatekeeper' ? undefined : values.department
          }
      const res = await api.post(endpoint, {
        ...payload
      })
      if (modalType === 'student') {
        const loginEmail = res.data.user?.email
        showToast({
          title: 'Student account created.',
          description: `Login email: ${loginEmail}. The student must change the temporary password on first login.`
        })
      } else {
        showToast({ title: `${modalType} created successfully.` })
      }
      setShowModal(false)
      setValues(initialUserValues)
      setErrors({})
      fetchUsers()
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
    setValues(initialUserValues)
    setErrors({})
    setShowModal(true)
  }

  const canToggleStatus = (targetUser) => {
    if (!targetUser || targetUser.id === currentUser?.id) {
      return false
    }

    if (!isCoordinator) {
      return true
    }

    return ['STUDENT', 'INSTRUCTOR'].includes(targetUser.role)
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">

        <PageHeader
          title="Users"
          subtitle="Manage all users in EduNexus"
          breadcrumbs={['Admin', 'Users']}
          actions={[
            ...(!isCoordinator ? [
              { label: 'Add Coordinator', icon: UserPlus, variant: 'primary', onClick: () => openModal('coordinator') },
              { label: 'Add Instructor', icon: UserPlus, variant: 'primary', onClick: () => openModal('instructor') },
              { label: 'Add Gate Account', icon: UserPlus, variant: 'primary', onClick: () => openModal('gatekeeper') }
            ] : []),
            { label: 'Add Student', icon: UserPlus, variant: 'primary', onClick: () => openModal('student') }
          ]}
        />

        {/* Success/Error messages */}
        <Alert type="error" message={error} />

        {/* Filter */}
        <div className="mb-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-slate-700">Search users</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, phone, roll number, or department"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border'
                  }`}
              >
                {role || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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
                    description="Try a different role filter or create a new account for your campus."
                    action={(
                      <button
                        type="button"
                        onClick={() => openModal('student')}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>Add Student</span>
                      </button>
                    )}
                  />
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Directory</h2>
                  <p className="text-sm text-slate-500">Manage account access, roles, and user status.</p>
                </div>
                <span className="ui-status-badge ui-status-neutral">{total} records</span>
              </div>
              <div className="overflow-x-auto max-h-[720px]">
              <table className="w-full min-w-[840px]">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Details</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-slate-200 transition-colors hover:bg-blue-50/30">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{user.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{user.phone || user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{user.email}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={user.role} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {user.student && `Sem ${user.student.semester} · ${user.student.rollNumber}`}
                        {user.instructor && `${user.instructor.department || 'No dept'}`}
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
                                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                              aria-label={user.isActive ? `Disable ${user.name}` : `Enable ${user.name}`}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                          ) : null}
                          {!isCoordinator && (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700 transition hover:bg-red-200"
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
                  <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
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
                  <p className="text-xs text-gray-500">
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
              {modalType !== 'gatekeeper' && (
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
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium"
                >
                  Create {modalType === 'coordinator' ? 'Coordinator' : modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}
                </button>
              </div>
            </form>
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



