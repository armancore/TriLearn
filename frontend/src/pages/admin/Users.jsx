import { useState, useEffect } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import useForm from '../../hooks/useForm'
import logger from '../../utils/logger'
const initialUserValues = {
  name: '',
  email: '',
  password: '',
  phone: '',
  department: '',
  semester: '1',
  section: ''
}

const Users = () => {
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('instructor')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const validateUserForm = (values) => {
    const validationErrors = {}

    if (!values.name.trim()) validationErrors.name = 'Name is required'
    if (!values.email.trim()) validationErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(values.email)) validationErrors.email = 'Enter a valid email address'
    if (!values.password) validationErrors.password = 'Password is required'
    else if (values.password.length < 6) validationErrors.password = 'Password must be at least 6 characters'

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
      const endpoint = modalType === 'instructor'
        ? '/admin/users/instructor'
        : modalType === 'gatekeeper'
          ? '/admin/users/gatekeeper'
        : '/admin/users/student'
      await api.post(endpoint, {
        ...values,
        semester: modalType === 'student' ? parseInt(values.semester, 10) : undefined
      })
      setSuccess(`${modalType} created successfully!`)
      setShowModal(false)
      setValues(initialUserValues)
      setErrors({})
      fetchUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await api.patch(`/admin/users/${id}/toggle-status`)
      setSuccess(`User ${currentStatus ? 'disabled' : 'enabled'} successfully!`)
      fetchUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    try {
      await api.delete(`/admin/users/${id}`)
      setSuccess('User deleted successfully!')
      fetchUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
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
          <div className="flex gap-3">
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
          {['', 'ADMIN', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT'].map((role) => (
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
            <LoadingSpinner text="Loading users..." />
          ) : (
            <>
              <table className="w-full">
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
                        {user.role === 'GATEKEEPER' && 'Gate QR operator'}
                        {user.admin && 'Administrator'}
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
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-xs px-3 py-1 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
            </>
          )}
        </div>

      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={`Add ${modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}`}
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
                  Create {modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}
                </button>
              </div>
            </form>
        </Modal>
      )}

    </AdminLayout>
  )
}

export default Users



