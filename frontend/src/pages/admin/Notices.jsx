import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import useForm from '../../hooks/useForm'
import logger from '../../utils/logger'
const initialNoticeValues = { title: '', content: '', type: 'GENERAL' }
const noticeToneClasses = {
  URGENT: 'border-l-red-500',
  EXAM: 'border-l-orange-500',
  GENERAL: 'border-l-slate-400',
  EVENT: 'border-l-blue-500',
  HOLIDAY: 'border-l-green-500'
}

const relativeDate = (value) => {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'UN'

const Notices = () => {
  const [notices, setNotices] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editNotice, setEditNotice] = useState(null)
  const [noticeToDelete, setNoticeToDelete] = useState(null)
  const [deletingNotice, setDeletingNotice] = useState(false)
  const [expandedNoticeIds, setExpandedNoticeIds] = useState([])
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

  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get(`/notices?page=${page}&limit=${limit}`)
      setNotices(res.data.notices)
      setTotal(res.data.total)
    } catch (error) {
      logger.error('Failed to load admin notices', error)
    } finally {
      setLoading(false)
    }
  }, [limit, page])

  useEffect(() => {
    void fetchNotices()
  }, [fetchNotices])

  const saveNotice = async (formValues) => {
    setError('')
    try {
      if (editNotice) {
        await api.put(`/notices/${editNotice.id}`, formValues)
        setSuccess('Notice updated successfully!')
      } else {
        await api.post('/notices', formValues)
        setSuccess('Notice created successfully!')
      }
      setShowModal(false)
      setEditNotice(null)
      setValues(initialNoticeValues)
      setErrors({})
      void fetchNotices()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async () => {
    if (!noticeToDelete) return
    try {
      setDeletingNotice(true)
      await api.delete(`/notices/${noticeToDelete.id}`)
      setNoticeToDelete(null)
      setSuccess('Notice deleted!')
      void fetchNotices()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setDeletingNotice(false)
    }
  }

  const openEditModal = (notice) => {
    setEditNotice(notice)
    setValues({ title: notice.title, content: notice.content, type: notice.type })
    setErrors({})
    setError('')
    setShowModal(true)
  }

  const openCreateModal = () => {
    setEditNotice(null)
    setValues(initialNoticeValues)
    setErrors({})
    setError('')
    setShowModal(true)
  }

  const toggleExpanded = (noticeId) => {
    setExpandedNoticeIds((current) => (
      current.includes(noticeId)
        ? current.filter((id) => id !== noticeId)
        : [...current, noticeId]
    ))
  }

  return (
    <AdminLayout>
      <div className="p-8">

        <PageHeader
          title="Notices"
          subtitle="Post and manage notices for everyone"
          breadcrumbs={['Admin', 'Notices']}
          actions={[{ label: 'Post Notice', icon: Plus, variant: 'primary', onClick: openCreateModal }]}
        />

        {/* Success/Error */}
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {/* Notices List */}
        {loading ? (
          <LoadingSpinner text="Loading notices..." />
        ) : (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className={`ui-card rounded-2xl border-l-4 p-6 transition hover:shadow-md ${noticeToneClasses[notice.type] || noticeToneClasses.GENERAL}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="ui-role-fill flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white">
                          {initialsFromName(notice.user?.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{notice.user?.name || 'Unknown author'}</p>
                          <p className="text-xs text-slate-400">{relativeDate(notice.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <StatusBadge status={notice.type} />
                        <span className="text-xs text-gray-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3 className="font-semibold text-gray-800 mb-2">{notice.title}</h3>
                      <p className={`text-sm text-gray-500 ${expandedNoticeIds.includes(notice.id) ? '' : 'line-clamp-2'}`}>{notice.content}</p>
                      {notice.content.length > 140 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(notice.id)}
                          className="mt-3 text-sm font-medium text-[var(--color-role-accent)]"
                        >
                          {expandedNoticeIds.includes(notice.id) ? 'Read Less' : 'Read More'}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => openEditModal(notice)}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setNoticeToDelete(notice)}
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
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </>
        )}

      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editNotice ? 'Edit Notice' : 'Post Notice'} onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />

            <form onSubmit={handleSubmit(saveNotice)} className="space-y-4">
              <div>
                <label className="ui-form-label">Notice Title</label>
                <input
                  name="title"
                  type="text"
                  required
                  value={values.title}
                  onChange={handleChange}
                  className={`ui-form-input ${errors.title ? 'ui-form-input-error' : ''}`}
                />
                {errors.title && <p className="ui-form-helper-error">{errors.title}</p>}
              </div>
              <div>
                <label className="ui-form-label">Notice Content</label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  value={values.content}
                  onChange={handleChange}
                  className={`ui-form-input ${errors.content ? 'ui-form-input-error' : ''}`}
                />
                {errors.content && <p className="ui-form-helper-error">{errors.content}</p>}
              </div>
              <div>
                <label className="ui-form-label">Notice Type</label>
                <select
                  name="type"
                  value={values.type}
                  onChange={handleChange}
                  className="ui-form-input"
                >
                  <option value="GENERAL">General</option>
                  <option value="EXAM">Exam</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="EVENT">Event</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
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
                  {editNotice ? 'Update' : 'Post Notice'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!noticeToDelete}
        title="Delete Notice"
        message={noticeToDelete ? `Delete "${noticeToDelete.title}"? This will remove it for all users.` : ''}
        confirmText="Delete Notice"
        busy={deletingNotice}
        onClose={() => setNoticeToDelete(null)}
        onConfirm={handleDelete}
      />

    </AdminLayout>
  )
}

export default Notices



