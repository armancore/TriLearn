import { useState, useEffect } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import useForm from '../../hooks/useForm'
import logger from '../../utils/logger'
const initialNoticeValues = { title: '', content: '', type: 'GENERAL' }

const InstructorNotices = () => {
  const [notices, setNotices] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const validateNotice = (values) => {
    const validationErrors = {}
    if (!values.title.trim()) validationErrors.title = 'Title is required'
    else if (values.title.trim().length < 3) validationErrors.title = 'Title must be at least 3 characters'
    if (!values.content.trim()) validationErrors.content = 'Content is required'
    else if (values.content.trim().length < 10) validationErrors.content = 'Content must be at least 10 characters'
    return validationErrors
  }
  const { values, errors, handleChange, handleSubmit, setValues, setErrors } = useForm(initialNoticeValues, validateNotice)

  useEffect(() => { fetchNotices() }, [page])

  const fetchNotices = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/notices?page=${page}&limit=${limit}`)
      setNotices(res.data.notices)
      setTotal(res.data.total)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  const saveNotice = async (formValues) => {
    setError('')
    try {
      await api.post('/notices', formValues)
      setSuccess('Notice posted successfully!')
      setShowModal(false)
      setValues(initialNoticeValues)
      setErrors({})
      fetchNotices()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  return (
    <InstructorLayout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Notices</h1>
            <p className="text-gray-500 text-sm mt-1">View and post notices</p>
          </div>
          <button onClick={() => { setShowModal(true); setError(''); setValues(initialNoticeValues); setErrors({}) }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium">
            + Post Notice
          </button>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSpinner text="Loading notices..." />
        ) : (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <StatusBadge status={notice.type} />
                    <span className="text-xs text-gray-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                    <span className="text-xs text-gray-400">by {notice.user?.name}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 mb-1">{notice.title}</h3>
                  <p className="text-sm text-gray-500">{notice.content}</p>
                </div>
              ))}
            </div>
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </>
        )}
      </div>

      {showModal && (
        <Modal title="Post Notice" onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit(saveNotice)} className="space-y-4">
              <input name="title" type="text" placeholder="Title" required value={values.title}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              {errors.title && <p className="text-xs text-red-600 -mt-2">{errors.title}</p>}
              <textarea name="content" placeholder="Content" required rows={4} value={values.content}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              {errors.content && <p className="text-xs text-red-600 -mt-2">{errors.content}</p>}
              <select name="type" value={values.type} onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="GENERAL">General</option>
                <option value="EXAM">Exam</option>
                <option value="HOLIDAY">Holiday</option>
                <option value="EVENT">Event</option>
                <option value="URGENT">Urgent</option>
              </select>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 font-medium">Post</button>
              </div>
            </form>
        </Modal>
      )}
    </InstructorLayout>
  )
}

export default InstructorNotices



