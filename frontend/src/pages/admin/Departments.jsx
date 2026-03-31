import { useEffect, useState } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'

const emptyForm = { name: '', code: '', description: '' }

const Departments = () => {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      setLoading(true)
      const res = await api.get('/departments')
      setDepartments(res.data.departments)
    } catch (fetchError) {
      console.error(fetchError)
      setError('Unable to load departments')
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingDepartment(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEditModal = (department) => {
    setEditingDepartment(department)
    setForm({
      name: department.name,
      code: department.code,
      description: department.description || ''
    })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (editingDepartment) {
        await api.put(`/departments/${editingDepartment.id}`, form)
        setSuccess('Department updated successfully!')
      } else {
        await api.post('/departments', form)
        setSuccess('Department created successfully!')
      }

      setShowModal(false)
      setForm(emptyForm)
      setEditingDepartment(null)
      fetchDepartments()
      setTimeout(() => setSuccess(''), 3000)
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async (department) => {
    if (!window.confirm(`Delete ${department.name}?`)) return

    try {
      await api.delete(`/departments/${department.id}`)
      setSuccess('Department deleted successfully!')
      fetchDepartments()
      setTimeout(() => setSuccess(''), 3000)
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Something went wrong')
    }
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Departments</h1>
            <p className="text-gray-500 text-sm mt-1">Create and manage the departments used across users and subjects.</p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            + Add Department
          </button>
        </div>

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {departments.map((department) => (
              <div key={department.id} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {department.code}
                    </span>
                    <h3 className="font-semibold text-gray-800 mt-2">{department.name}</h3>
                  </div>
                </div>

                {department.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-3">{department.description}</p>
                )}

                <div className="flex gap-4 text-xs text-gray-500 mb-4">
                  <span>👨‍🎓 {department._count?.students || 0} students</span>
                  <span>👩‍🏫 {department._count?.instructors || 0} instructors</span>
                  <span>📚 {department._count?.subjects || 0} subjects</span>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <button
                    onClick={() => openEditModal(department)}
                    className="flex-1 text-xs bg-blue-50 text-blue-600 py-2 rounded-lg hover:bg-blue-100 transition font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(department)}
                    className="flex-1 text-xs bg-red-50 text-red-600 py-2 rounded-lg hover:bg-red-100 transition font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {departments.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                No departments yet. Create one to use it in users and subjects.
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                {editingDepartment ? 'Edit Department' : 'Add Department'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Department Name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Department Code"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Description (optional)"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">
                  {editingDepartment ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export default Departments
