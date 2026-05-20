import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import InstructorLayout from '../../layouts/InstructorLayout'
import { useReferenceData } from '../../context/ReferenceDataContext'
import { useToast } from '../../components/Toast'
import api, { fetchFileBlob } from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const Tasks = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSubjectRef = useRef(searchParams.get('subject') || '')
  const requestRef = useRef(null)
  const { subjects, loadSubjects } = useReferenceData()
  const { showToast } = useToast()
  const [selectedSubject, setSelectedSubject] = useState(initialSubjectRef.current)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showSubmissions, setShowSubmissions] = useState(null)
  const [taskPdf, setTaskPdf] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    subjectId: '',
    dueDate: ''
  })

  const syncSubjectInUrl = useCallback((nextSubjectId) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextSubjectId) nextParams.set('subject', nextSubjectId)
    else nextParams.delete('subject')
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const fetchTasks = useCallback(async () => {
    if (requestRef.current) requestRef.current.abort()
    const controller = new AbortController()
    requestRef.current = controller

    try {
      setLoading(true)
      setError('')
      const response = await api.get('/tasks', {
        signal: controller.signal,
        params: {
          ...(selectedSubject ? { subjectId: selectedSubject } : {}),
          limit: 100
        }
      })
      setTasks(response.data.tasks || [])
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) return
      logger.error('Failed to load tasks', fetchError)
      setError(fetchError.response?.data?.message || 'Unable to load tasks right now.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [selectedSubject])

  useEffect(() => {
    void fetchTasks()
    return () => {
      if (requestRef.current) requestRef.current.abort()
    }
  }, [fetchTasks])

  useEffect(() => {
    const controller = new AbortController()
    void loadSubjects({ signal: controller.signal }).catch((loadError) => {
      if (isRequestCanceled(loadError)) return
      logger.error('Failed to load subjects for tasks', loadError)
      setError(loadError.response?.data?.message || 'Unable to load your modules right now.')
    })
    return () => controller.abort()
  }, [loadSubjects])

  useEffect(() => {
    if (!subjects.length) return
    const nextSubjectId = subjects.some((subject) => subject.id === selectedSubject)
      ? selectedSubject
      : subjects[0]?.id || ''

    if (nextSubjectId !== selectedSubject) {
      setSelectedSubject(nextSubjectId)
      syncSubjectInUrl(nextSubjectId)
    }

    if (nextSubjectId) {
      setForm((current) => ({ ...current, subjectId: nextSubjectId }))
    }
  }, [selectedSubject, subjects, syncSubjectInUrl])

  const openPreview = async (title, fileUrl) => {
    try {
      const { blob } = await fetchFileBlob(fileUrl)
      const objectUrl = window.URL.createObjectURL(blob)
      if (previewFile?.objectUrl) window.URL.revokeObjectURL(previewFile.objectUrl)
      setPreviewFile({ title, url: objectUrl, objectUrl, canEmbed: blob.type === 'application/pdf' })
    } catch (previewError) {
      logger.error('Failed to preview task file', previewError)
      setError('Unable to open this PDF preview right now.')
    }
  }

  const closePreview = () => {
    if (previewFile?.objectUrl) window.URL.revokeObjectURL(previewFile.objectUrl)
    setPreviewFile(null)
  }

  const openTaskModal = () => {
    if (!subjects.length) {
      setError('No assigned modules found. Ask an admin or coordinator to assign a module first.')
      return
    }
    const subjectId = selectedSubject || subjects[0]?.id || ''
    setForm({ title: '', description: '', subjectId, dueDate: '' })
    setTaskPdf(null)
    setError('')
    setShowModal(true)
  }

  const handleSubjectChange = (subjectId) => {
    setSelectedSubject(subjectId)
    syncSubjectInUrl(subjectId)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('subjectId', form.subjectId)
      payload.append('dueDate', form.dueDate)
      if (taskPdf) payload.append('questionPdf', taskPdf)

      await api.post('/tasks', payload)
      showToast({ title: 'Task created successfully.' })
      setShowModal(false)
      handleSubjectChange(form.subjectId)
      await fetchTasks()
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Unable to create task right now.')
    }
  }

  const handleViewSubmissions = async (taskId) => {
    try {
      setError('')
      const response = await api.get(`/tasks/${taskId}`)
      setShowSubmissions(response.data.task)
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Unable to load task submissions right now.')
    }
  }

  const handleFeedback = async (submissionId) => {
    const feedbackValue = document.getElementById(`feedback-${submissionId}`)?.value || ''
    if (!feedbackValue.trim()) {
      setError('Please enter feedback before saving.')
      return
    }

    try {
      await api.patch(`/tasks/submissions/${submissionId}/feedback`, { feedback: feedbackValue })
      showToast({ title: 'Feedback saved successfully.' })
      if (showSubmissions) {
        const response = await api.get(`/tasks/${showSubmissions.id}`)
        setShowSubmissions(response.data.task)
      }
    } catch (submitError) {
      setError(submitError.response?.data?.message || 'Unable to save feedback right now.')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <InstructorLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Tasks"
          subtitle="Create subject tasks, view uploaded student answers, and send feedback without marks."
          breadcrumbs={['Instructor', 'Tasks']}
          actions={[{
            label: 'Add Task',
            icon: Plus,
            variant: 'primary',
            disabled: subjects.length === 0,
            onClick: openTaskModal
          }]}
        />

        <Alert type="error" message={error} />

        <div className="mb-6 rounded-2xl bg-[--color-bg-card] p-4 shadow-sm dark:bg-slate-800">
          <label className="mb-2 block text-sm text-[var(--color-text-muted)]">Module</label>
          <select value={selectedSubject} onChange={(event) => handleSubjectChange(event.target.value)} className="ui-form-input">
            <option value="">Select Module</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name} - {subject.code}</option>
            ))}
          </select>
        </div>

        {!subjects.length ? (
          <EmptyState icon="📝" title="No modules available yet" description="Assigned modules will appear here before you can create tasks." />
        ) : loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-32" />
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:bg-slate-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="font-semibold text-[var(--color-heading)]">{task.title}</h3>
                      {isOverdue(task.dueDate) && <span className="status-absent rounded-full px-2 py-0.5 text-xs">Overdue</span>}
                    </div>
                    <p className="mb-3 text-sm text-[var(--color-text-muted)]">{task.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-muted)]">
                      <span>{task.subject?.name}</span>
                      <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                      <span>{task._count?.submissions || 0} answers</span>
                      {task.questionPdfUrl && (
                        <button type="button" onClick={() => openPreview(`${task.title} - Task PDF`, task.questionPdfUrl)} className="font-medium text-[var(--color-role-accent)] hover:underline">
                          View Task PDF
                        </button>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => handleViewSubmissions(task.id)} className="status-present rounded-lg border px-3 py-2 text-xs">
                    View Answers
                  </button>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <EmptyState icon="📝" title="No tasks yet" description="Create a task for your subject to collect student answers." />
            )}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Add Task" onClose={() => setShowModal(false)}>
          <Alert type="error" message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" required placeholder="Task title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="ui-form-input" />
            <textarea required rows={3} placeholder="Task details" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="ui-form-input" />
            <select required value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })} className="ui-form-input">
              <option value="">Select Module</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name} - {subject.code}</option>
              ))}
            </select>
            <input type="datetime-local" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="ui-form-input" />
            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-muted)]">Task PDF (optional)</label>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => setTaskPdf(event.target.files?.[0] || null)} className="ui-form-input" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
              <button type="submit" className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showSubmissions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[--color-bg-card] p-8 shadow-xl dark:bg-slate-800">
            <div className="mb-6 flex items-center justify-between border-b border-[var(--color-card-border)] pb-4">
              <h2 className="text-xl font-bold text-[var(--color-heading)]">Task Answers - {showSubmissions.title}</h2>
              <button type="button" onClick={() => setShowSubmissions(null)} className="text-xl text-[var(--color-text-soft)]">X</button>
            </div>
            <div className="space-y-4">
              {showSubmissions.submissions?.length === 0 && (
                <EmptyState icon="📤" title="No answers yet" description="Student task answers will appear here after upload." />
              )}
              {showSubmissions.submissions?.map((submission) => (
                <div key={submission.id} className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)]/60 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-[var(--color-heading)]">{submission.student?.user?.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{submission.note || 'No note'}</p>
                      {submission.fileUrl && (
                        <button type="button" onClick={() => openPreview(`${submission.student?.user?.name || 'Student'} - Task Answer`, submission.fileUrl)} className="mt-2 text-sm text-[var(--color-role-accent)] hover:underline">
                          View Answer PDF
                        </button>
                      )}
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">Submitted: {new Date(submission.submittedAt).toLocaleDateString()}</p>
                      {submission.feedback && (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                          Feedback sent: {submission.feedback}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <textarea id={`feedback-${submission.id}`} rows={4} placeholder="Feedback for student" defaultValue={submission.feedback || ''} className="ui-form-input w-64 px-2 py-1 text-sm" />
                      <button type="button" onClick={() => handleFeedback(submission.id)} className="ui-role-fill rounded-lg px-3 py-2 text-xs">
                        Save Feedback
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[--color-bg-card] shadow-xl dark:bg-slate-800">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">{previewFile.title}</h2>
              <button type="button" onClick={closePreview} className="text-xl text-[var(--color-text-soft)]">X</button>
            </div>
            <iframe src={previewFile.url} title={previewFile.title} className="w-full flex-1" referrerPolicy="no-referrer" />
          </div>
        </div>
      )}
    </InstructorLayout>
  )
}

export default Tasks
