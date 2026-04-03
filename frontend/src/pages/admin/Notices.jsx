import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import useForm from '../../hooks/useForm'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import logger from '../../utils/logger'
const initialNoticeValues = { title: '', content: '', type: 'GENERAL', audience: 'ALL', targetDepartment: '', targetSemester: '' }
const noticeToneClasses = {
  URGENT: 'border-l-red-500',
  EXAM: 'border-l-orange-500',
  GENERAL: 'border-l-slate-400',
  EVENT: 'border-l-blue-500',
  HOLIDAY: 'border-l-green-500'
}

const audienceLabelMap = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  INSTRUCTORS_ONLY: 'Instructors Only'
}

const buildNoticeTargetSummary = (notice) => {
  const parts = [audienceLabelMap[notice.audience] || 'Everyone']
  if (notice.targetDepartment) parts.push(notice.targetDepartment)
  if (notice.targetSemester) parts.push(`Semester ${notice.targetSemester}`)
  return parts.join(' • ')
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
  const { user } = useAuth()
  const { departments, loadDepartments } = useReferenceData()
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
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const isCoordinator = user?.role === 'COORDINATOR'
  const canPostInstructorOnly = user?.role === 'ADMIN' || user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)

  const validateNotice = (values) => {
    const validationErrors = {}
    if (!values.title.trim()) validationErrors.title = 'Title is required'
    else if (values.title.trim().length < 3) validationErrors.title = 'Title must be at least 3 characters'
    if (!values.content.trim()) validationErrors.content = 'Content is required'
    else if (values.content.trim().length < 10) validationErrors.content = 'Content must be at least 10 characters'
    if (values.targetSemester && (!Number.isInteger(Number(values.targetSemester)) || Number(values.targetSemester) < 1 || Number(values.targetSemester) > 12)) {
      validationErrors.targetSemester = 'Semester must be between 1 and 12'
    }
    return validationErrors
  }
  const { values, errors, handleChange, handleSubmit, setValues, setErrors } = useForm(initialNoticeValues, validateNotice)

  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/notices', {
        params: {
          page,
          limit,
          ...(debouncedSearchTerm.trim() ? { search: debouncedSearchTerm.trim() } : {})
        }
      })
      setNotices(res.data.notices)
      setTotal(res.data.total)
    } catch (error) {
      logger.error('Failed to load admin notices', error)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearchTerm, limit, page])

  useEffect(() => {
    void fetchNotices()
  }, [fetchNotices])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearchTerm])

  useEffect(() => {
    if (!isCoordinator) {
      void loadDepartments()
    }
  }, [isCoordinator, loadDepartments])

  const saveNotice = async (formValues) => {
    setError('')
    try {
      const payload = {
        ...formValues,
        targetDepartment: formValues.targetDepartment || undefined,
        targetSemester: formValues.audience === 'INSTRUCTORS_ONLY'
          ? undefined
          : (formValues.targetSemester ? Number(formValues.targetSemester) : undefined)
      }

      if (editNotice) {
        await api.put(`/notices/${editNotice.id}`, payload)
        showToast({ title: 'Notice updated successfully.' })
      } else {
        await api.post('/notices', payload)
        showToast({ title: 'Notice created successfully.' })
      }
      setShowModal(false)
      setEditNotice(null)
      setValues(initialNoticeValues)
      setErrors({})
      void fetchNotices()
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
      showToast({ title: 'Notice deleted.' })
      void fetchNotices()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setDeletingNotice(false)
    }
  }

  const openEditModal = (notice) => {
    setEditNotice(notice)
    setValues({
      title: notice.title,
      content: notice.content,
      type: notice.type,
      audience: notice.audience || 'ALL',
      targetDepartment: notice.targetDepartment || '',
      targetSemester: notice.targetSemester ? String(notice.targetSemester) : ''
    })
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
    <Layout>
      <div className="p-4 md:p-8">

        <PageHeader
          title="Notices"
          subtitle={isCoordinator ? 'Post and manage targeted notices for your department or instructors' : 'Post and manage targeted notices across departments and semesters'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Notices']}
          actions={[{ label: 'Post Notice', icon: Plus, variant: 'primary', onClick: openCreateModal }]}
        />

        {/* Success/Error */}
        <Alert type="error" message={error} />

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">Search notices</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by title, content, department, or author"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

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
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          {buildNoticeTargetSummary(notice)}
                        </span>
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
                <div className="p-2">
                  <EmptyState
                    icon="📣"
                    title="No notices yet"
                    description="Create the first notice to share campus updates with your users."
                    action={(
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                      >
                        Post Notice
                      </button>
                    )}
                  />
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
              <div>
                <label className="ui-form-label">Audience</label>
                <select
                  name="audience"
                  value={values.audience}
                  onChange={handleChange}
                  className="ui-form-input"
                >
                  <option value="ALL">Everyone</option>
                  <option value="STUDENTS">Students</option>
                  {canPostInstructorOnly ? <option value="INSTRUCTORS_ONLY">Instructors Only</option> : null}
                </select>
              </div>
              <div>
                <label className="ui-form-label">Target Department</label>
                {isCoordinator ? (
                  <input
                    type="text"
                    value={values.targetDepartment || 'Managed automatically for your department'}
                    disabled
                    className="ui-form-input bg-slate-100 text-slate-500"
                  />
                ) : (
                  <select
                    name="targetDepartment"
                    value={values.targetDepartment}
                    onChange={handleChange}
                    className="ui-form-input"
                  >
                    <option value="">All Departments</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.code}>{department.code}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="ui-form-label">Target Semester</label>
                <select
                  name="targetSemester"
                  value={values.targetSemester}
                  onChange={handleChange}
                  disabled={values.audience === 'INSTRUCTORS_ONLY'}
                  className="ui-form-input disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">All Semesters</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((semester) => (
                    <option key={semester} value={semester}>{`Semester ${semester}`}</option>
                  ))}
                </select>
                {errors.targetSemester && <p className="ui-form-helper-error">{errors.targetSemester}</p>}
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

    </Layout>
  )
}

export default Notices



