import { useState, useEffect } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import api from '../../utils/api'

const Notices = () => {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editNotice, setEditNotice] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', type: 'GENERAL' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchNotices() }, [])

  const fetchNotices = async () => {
    try {
      setLoading(true)
      const res = await api.get('/notices')
      setNotices(res.data.notices)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editNotice) {
        await api.put(`/notices/${editNotice.id}`, form)
        setSuccess('Notice updated successfully!')
      } else {
        await api.post('/notices', form)
        setSuccess('Notice created successfully!')
      }
      setShowModal(false)
      setEditNotice(null)
      setForm({ title: '', content: '', type: 'GENERAL' })
      fetchNotices()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notice?')) return
    try {
      await api.delete(`/notices/${id}`)
      setSuccess('Notice deleted!')
      fetchNotices()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const openEditModal = (notice) => {
    setEditNotice(notice)
    setForm({ title: notice.title, content: notice.content, type: notice.type })
    setError('')
    setShowModal(true)
  }

  const openCreateModal = () => {
    setEditNotice(null)
    setForm({ title: '', content: '', type: 'GENERAL' })
    setError('')
    setShowModal(true)
  }

  return (
    <AdminLayout>
      <div className="p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Notices</h1>
            <p className="text-gray-500 text-sm mt-1">Post and manage notices for everyone</p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            + Post Notice
          </button>
        </div>

        {/* Success/Error */}
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {/* Notices List */}
        {loading ? (
          <LoadingSpinner text="Loading notices..." />
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <div key={notice.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={notice.type} />
                      <span className="text-xs text-gray-400">
                        {new Date(notice.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-gray-400">
                        by {notice.user?.name}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">{notice.title}</h3>
                    <p className="text-sm text-gray-500">{notice.content}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openEditModal(notice)}
                      className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(notice.id)}
                      className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {notices.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No notices yet. Click + Post Notice to create one!
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editNotice ? 'Edit Notice' : 'Post Notice'} onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Notice Title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Notice content..."
                required
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="GENERAL">General</option>
                <option value="EXAM">Exam</option>
                <option value="HOLIDAY">Holiday</option>
                <option value="EVENT">Event</option>
                <option value="URGENT">Urgent</option>
              </select>
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
                  {editNotice ? 'Update' : 'Post Notice'}
                </button>
              </div>
            </form>
        </Modal>
      )}

    </AdminLayout>
  )
}

export default Notices
