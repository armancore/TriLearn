import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import useForm from '../../hooks/useForm'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
const initialNoticeValues = { title: '', content: '', type: 'GENERAL', audience: 'STUDENTS', targetSemester: '' }

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

const InstructorNotices = () => {
  const [notices, setNotices] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()
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

  const fetchNotices = useCallback(async (signal) => {
    try {
      setLoading(true)
      const res = await api.get(`/notices?page=${page}&limit=${limit}`, { signal })
      setNotices(res.data.notices)
      setTotal(res.data.total)
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error(error)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [limit, page])

  useEffect(() => {
    const controller = new AbortController()
    void fetchNotices(controller.signal)
    return () => controller.abort()
  }, [fetchNotices])

  const saveNotice = async (formValues) => {
    setError('')
    try {
      await api.post('/notices', {
        ...formValues,
        targetSemester: formValues.targetSemester ? Number(formValues.targetSemester) : undefined
      })
      showToast({ title: 'Notice posted successfully.' })
      setShowModal(false)
      setValues(initialNoticeValues)
      setErrors({})
      fetchNotices()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  return (
    <InstructorLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Notices"
          subtitle="View notices and post updates for your department or selected semester"
          breadcrumbs={['Instructor', 'Notices']}
          actions={[{ label: 'Post Notice', icon: Plus, variant: 'primary', onClick: () => { setShowModal(true); setError(''); setValues(initialNoticeValues); setErrors({}) } }]}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-28" />
        ) : (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <StatusBadge status={notice.type} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {buildNoticeTargetSummary(notice)}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                    <span className="text-xs text-gray-400">by {notice.user?.name}</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 mb-1">{notice.title}</h3>
                  <p className="text-sm text-gray-500">{notice.content}</p>
                </div>
              ))}
              {notices.length === 0 && (
                <EmptyState
                  icon="📣"
                  title="No notices available"
                  description="Post a notice to share class updates with your students."
                />
              )}
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
              <select
                name="audience"
                value={values.audience}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="STUDENTS">Students</option>
                <option value="ALL">Everyone</option>
              </select>
              <select
                name="targetSemester"
                value={values.targetSemester}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Semesters</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((semester) => (
                  <option key={semester} value={semester}>{`Semester ${semester}`}</option>
                ))}
              </select>
              {errors.targetSemester && <p className="text-xs text-red-600 -mt-2">{errors.targetSemester}</p>}
              <p className="text-xs text-slate-500 -mt-1">Your department will be applied automatically to student-facing notices.</p>
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



