import { useState, useEffect } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'
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

const Users = () => {
  const { user: currentUser } = useAuth()
  const isCoordinator = currentUser?.role === 'COORDINATOR'
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('instructor')
  const [userToDelete, setUserToDelete] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filterRole, setFilterRole] = useState('')
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
  }, [filterRole, page])

  useEffect(() => {
    setPage(1)
  }, [filterRole])

  useEffect(() => {
    fetchDepartments()
  }, [])

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

      const res = await api.get(`/admin/users?${params.toString()}`)
      setUsers(res.data.users)
      setTotal(res.data.total)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments')
      setDepartments(res.data.departments)
    } catch (fetchError) {
      logger.error(fetchError)
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
        const defaultPassword = res.data.user?.defaultPassword
        setSuccess(`Student account created. Login email: ${loginEmail}${defaultPassword ? ` | Default password: ${defaultPassword}` : ''}`)
      } else {
        setSuccess(`${modalType} created successfully!`)
      }
      setShowModal(false)
      setValues(initialUserValues)
      setErrors({})
      fetchUsers()
      setTimeout(() => setSuccess(''), 3000)
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
      setSuccess(`User ${nextStatus ? 'enabled' : 'disabled'} successfully!`)
      setTimeout(() => setSuccess(''), 3000)
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
      setSuccess('User deleted successfully!')
      setTimeout(() => setSuccess(''), 3000)
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

  return (
    <AdminLayout>
      <div className="p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Users</h1>
            <p className="text-gray-500 text-sm mt-1">Manage all users in EduNexus</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!isCoordinator && (
              <>
                <button
                  onClick={() => openModal('coordinator')}
                  className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition text-sm font-medium"
                >
                  + Add Coordinator
                </button>
                <button
                  onClick={() => openModal('instructor')}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm font-medium"
                >
                  + Add Instructor
                </button>
                <button
                  onClick={() => openModal('gatekeeper')}
                  className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition text-sm font-medium"
                >
                  + Add Gate Account
                </button>
              </>
            )}
            <button
              onClick={() => openModal('student')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              + Add Student
            </button>
          </div>
        </div>

        {/* Success/Error messages */}
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {/* Filter */}
        <div className="flex gap-3 mb-6">
          {['', 'ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT'].map((role) => (
            <button
              key={role}
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
                  />
                </div>
              ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[840px]">
                <thead className="bg-gray-50">
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
                    <tr key={user.id} className="border-t hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-800">{user.name}</td>
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
                          <button
                            onClick={() => handleToggleStatus(user.id, user.isActive)}
                            className={`text-xs px-3 py-1 rounded-lg font-medium transition
                              ${user.isActive
                                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                          >
                            {user.isActive ? 'Disable' : 'Enable'}
                          </button>
                          {!isCoordinator && (
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="text-xs px-3 py-1 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
              <input
                name="name"
                type="text"
                placeholder="Full Name"
                required
                value={values.name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.name && <p className="text-xs text-red-600 -mt-2">{errors.name}</p>}
              {modalType === 'student' ? (
                <>
                  <input
                    name="email"
                    type="email"
                    placeholder="Student Personal Email"
                    required
                    value={values.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.email && <p className="text-xs text-red-600 -mt-2">{errors.email}</p>}
                  <input
                    name="studentId"
                    type="text"
                    placeholder="Student ID / Roll Number"
                    required
                    value={values.studentId}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.studentId && <p className="text-xs text-red-600 -mt-2">{errors.studentId}</p>}
                  <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    The student will sign in using their personal email address and will be forced to change the default password on first login.
                  </div>
                </>
              ) : (
                <>
                  <input
                    name="email"
                    type="email"
                    placeholder="Email"
                    required
                    value={values.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.email && <p className="text-xs text-red-600 -mt-2">{errors.email}</p>}
                  <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                    value={values.password}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.password && <p className="text-xs text-red-600 -mt-2">{errors.password}</p>}
                  <p className="text-xs text-gray-500 -mt-2">
                    Use at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                </>
              )}
              <input
                name="phone"
                type="text"
                placeholder="Phone (optional)"
                value={values.phone}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {modalType !== 'gatekeeper' && (
                <>
                  <select
                  name="department"
                  value={values.department}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                  </select>
                  {errors.department && <p className="text-xs text-red-600 -mt-2">{errors.department}</p>}
                </>
              )}

              {modalType === 'student' && (
                <div className="flex gap-3">
                  <input
                    name="semester"
                    type="number"
                    placeholder="Semester"
                    min="1"
                    max="8"
                    value={values.semester}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    name="section"
                    type="text"
                    placeholder="Section (A/B/C)"
                    value={values.section}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              {modalType === 'student' && errors.semester && <p className="text-xs text-red-600 -mt-2">{errors.semester}</p>}
              {modalType === 'student' && errors.section && <p className="text-xs text-red-600 -mt-2">{errors.section}</p>}

              <div className="flex gap-3 pt-2">
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
    </AdminLayout>
  )
}

export default Users



