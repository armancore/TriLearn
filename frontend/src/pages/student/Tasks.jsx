import { useEffect, useState } from 'react'
import { BookOpenText, CalendarDays } from 'lucide-react'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import StudentLayout from '../../layouts/StudentLayout'
import { useToast } from '../../components/Toast'
import api, { fetchFileBlob } from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const StudentTasks = () => {
  const [tasks, setTasks] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState(null)
  const [submitForm, setSubmitForm] = useState({ note: '' })
  const [answerPdf, setAnswerPdf] = useState(null)
  const [error, setError] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const { showToast } = useToast()

  const fetchData = async (signal) => {
    try {
      setError('')
      const [tasksRes, submissionsRes] = await Promise.all([
        api.get('/tasks', { signal }),
        api.get('/tasks/my-submissions', { signal })
      ])
      setTasks(tasksRes.data.tasks || [])
      setSubmissions(submissionsRes.data.submissions || [])
    } catch (loadError) {
      if (isRequestCanceled(loadError)) return
      logger.error('Failed to load student tasks', loadError)
      setError(loadError.response?.data?.message || 'Unable to load tasks right now.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void fetchData(controller.signal)
    return () => controller.abort()
  }, [])

  const getSubmission = (taskId) => submissions.find((submission) => submission.taskId === taskId)

  const openPreview = async (title, fileUrl) => {
    try {
      const { blob } = await fetchFileBlob(fileUrl)
      const objectUrl = window.URL.createObjectURL(blob)
      if (previewFile?.objectUrl) window.URL.revokeObjectURL(previewFile.objectUrl)
      setPreviewFile({ title, url: objectUrl, objectUrl })
    } catch (previewError) {
      logger.error('Failed to preview task file', previewError)
      setError('Unable to open this PDF right now.')
    }
  }

  const closePreview = () => {
    if (previewFile?.objectUrl) window.URL.revokeObjectURL(previewFile.objectUrl)
    setPreviewFile(null)
  }

  const handleSubmit = async (taskId) => {
    setError('')
    if (!answerPdf) {
      setError('Please upload your answer PDF')
      return
    }

    try {
      const payload = new FormData()
      payload.append('note', submitForm.note)
      payload.append('answerPdf', answerPdf)
      await api.post(`/tasks/${taskId}/submit`, payload)
      showToast({ title: 'Task submitted successfully.' })
      setSubmittingId(null)
      setSubmitForm({ note: '' })
      setAnswerPdf(null)
      await fetchData()
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Unable to submit task right now.')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <StudentLayout>
      <div className="student-page p-4 md:p-8">
        <PageHeader
          title="Tasks"
          subtitle="View tasks from instructors, upload your answer PDF, and read feedback after review."
          breadcrumbs={['Student', 'Tasks']}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const submission = getSubmission(task.id)
              const overdue = isOverdue(task.dueDate)

              return (
                <div key={task.id} className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:bg-slate-800">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <h3 className="font-semibold text-[--color-text] dark:text-slate-100">{task.title}</h3>
                        {overdue && !submission && <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-700">Overdue</span>}
                        {submission && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary">{submission.status}</span>}
                      </div>
                      <p className="mb-3 text-sm text-[--color-text-muted] dark:text-slate-400">{task.description}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-[--color-text-muted] dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5"><BookOpenText className="h-3.5 w-3.5" />{task.subject?.name}</span>
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                        {task.questionPdfUrl && (
                          <button type="button" onClick={() => openPreview(`${task.title} - Task PDF`, task.questionPdfUrl)} className="font-medium text-primary hover:underline">
                            View Task PDF
                          </button>
                        )}
                        {submission?.feedback && <span className="font-medium text-primary">Feedback available</span>}
                      </div>
                    </div>
                  </div>

                  {!submission && (
                    <div className="mt-4 border-t pt-4">
                      {submittingId === task.id ? (
                        <div className="space-y-3">
                          <textarea rows={2} placeholder="Add a note (optional)" value={submitForm.note} onChange={(event) => setSubmitForm({ ...submitForm, note: event.target.value })} className="ui-form-input" />
                          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setAnswerPdf(event.target.files?.[0] || null)} className="ui-form-input" />
                          <div className="flex gap-3">
                            <button type="button" onClick={() => { setSubmittingId(null); setAnswerPdf(null); setError('') }} className="flex-1 rounded-lg border border-[--color-border] py-2 text-sm text-[--color-text-muted]">Cancel</button>
                            <button type="button" onClick={() => handleSubmit(task.id)} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white">Submit Task</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setSubmittingId(task.id); setError('') }} className="rounded-lg bg-primary px-4 py-2 text-sm text-white">
                          Submit Task
                        </button>
                      )}
                    </div>
                  )}

                  {submission && (
                    <div className="mt-4 rounded-xl border-t bg-[--color-bg] p-3 dark:bg-slate-900">
                      <p className="text-xs text-[--color-text-muted]">Submitted on {new Date(submission.submittedAt).toLocaleDateString()}</p>
                      {submission.fileUrl && (
                        <button type="button" onClick={() => openPreview(`${task.title} - Submitted Answer`, submission.fileUrl)} className="mt-1 inline-block text-sm text-primary hover:underline">
                          View Submitted PDF
                        </button>
                      )}
                      {submission.feedback && (
                        <div className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">
                          Instructor feedback: {submission.feedback}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {tasks.length === 0 && (
              <EmptyState icon={BookOpenText} title="No tasks yet" description="Tasks from your instructors will appear here." />
            )}
          </div>
        )}
      </div>

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[--color-bg-card] shadow-xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-[--color-text] dark:text-slate-100">{previewFile.title}</h2>
              <button type="button" onClick={closePreview} className="text-xl text-gray-400">X</button>
            </div>
            <iframe src={previewFile.url} title={previewFile.title} className="w-full flex-1" referrerPolicy="no-referrer" />
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentTasks
