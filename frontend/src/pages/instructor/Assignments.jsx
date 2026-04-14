import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import PageHeader from '../../components/PageHeader'
import InstructorLayout from '../../layouts/InstructorLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import api, { fetchFileBlob } from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const Assignments = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSubjectRef = useRef(searchParams.get('subject') || '')
  const assignmentRequestRef = useRef(null)
  const [showModal, setShowModal] = useState(false)
  const [showSubmissions, setShowSubmissions] = useState(null)
  const [selectedSubject, setSelectedSubject] = useState(initialSubjectRef.current)
  const [form, setForm] = useState({
    title: '',
    description: '',
    subjectId: '',
    dueDate: '',
    totalMarks: 100
  })
  const [questionPdf, setQuestionPdf] = useState(null)
  const [error, setError] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [exportingAssignmentId, setExportingAssignmentId] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [submissionsLoadingId, setSubmissionsLoadingId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignmentsError, setAssignmentsError] = useState('')
  const { showToast } = useToast()
  const { subjects, loadSubjects } = useReferenceData()

  const syncSubjectInUrl = useCallback((nextSubjectId) => {
    const nextParams = new URLSearchParams(searchParams)

    if (nextSubjectId) {
      nextParams.set('subject', nextSubjectId)
    } else {
      nextParams.delete('subject')
    }

    const currentQuery = searchParams.toString()
    const nextQuery = nextParams.toString()

    if (currentQuery !== nextQuery) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleSubjectChange = useCallback((nextSubjectId) => {
    setSelectedSubject(nextSubjectId)
    syncSubjectInUrl(nextSubjectId)
  }, [syncSubjectInUrl])

  const closePreview = () => {
    if (previewFile?.objectUrl) {
      window.URL.revokeObjectURL(previewFile.objectUrl)
    }

    setPreviewFile(null)
    setPreviewLoading(false)
  }

  const openPreview = async (title, fileUrl) => {
    if (!fileUrl) {
      setError('This file preview is unavailable because the file link is invalid.')
      return
    }

    try {
      setPreviewLoading(true)
      const { blob } = await fetchFileBlob(fileUrl)
      const objectUrl = window.URL.createObjectURL(blob)

      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }

      setPreviewFile({
        title,
        url: objectUrl,
        objectUrl,
        canEmbed: blob.type === 'application/pdf'
      })
    } catch (previewError) {
      logger.error('Failed to preview assignment file', previewError)
      setError('Unable to open this PDF preview right now. Try opening it in a new tab.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const fetchAssignments = useCallback(async () => {
    if (assignmentRequestRef.current) {
      assignmentRequestRef.current.abort()
    }

    const controller = new AbortController()
    assignmentRequestRef.current = controller

    try {
      setLoading(true)
      setAssignmentsError('')

      const response = await api.get('/assignments', {
        signal: controller.signal,
        params: {
          ...(selectedSubject ? { subjectId: selectedSubject } : {}),
          limit: 100
        }
      })

      if (controller.signal.aborted) {
        return
      }

      setAssignments(response.data.assignments || [])
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) {
        return
      }

      logger.error('Failed to load assignments', fetchError)
      setAssignments([])
      setAssignmentsError(fetchError.response?.data?.message || 'Unable to load assignments right now.')
      throw fetchError
    } finally {
      if (assignmentRequestRef.current === controller) {
        assignmentRequestRef.current = null
      }

      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [selectedSubject])

  useEffect(() => {
    void fetchAssignments().catch((fetchError) => {
      if (isRequestCanceled(fetchError)) {
        return
      }
    })

    return () => {
      if (assignmentRequestRef.current) {
        assignmentRequestRef.current.abort()
        assignmentRequestRef.current = null
      }
    }
  }, [fetchAssignments])

  useEffect(() => {
    const controller = new AbortController()
    void loadSubjects({ signal: controller.signal }).catch((loadError) => {
      if (isRequestCanceled(loadError)) {
        return
      }

      logger.error('Failed to load subjects for assignments', loadError)
      setError(loadError.response?.data?.message || 'Unable to load your modules right now.')
    })
    return () => controller.abort()
  }, [loadSubjects])

  useEffect(() => {
    if (subjects.length === 0) {
      return
    }

    const hasSelectedSubject = subjects.some((subject) => subject.id === selectedSubject)
    const nextSubjectId = hasSelectedSubject ? selectedSubject : subjects[0]?.id || ''

    if (nextSubjectId !== selectedSubject) {
      setSelectedSubject(nextSubjectId)
      syncSubjectInUrl(nextSubjectId)
    }

    if (nextSubjectId) {
      setForm((current) => ({ ...current, subjectId: nextSubjectId }))
    }
  }, [selectedSubject, subjects, syncSubjectInUrl])

  const openAssignmentModal = () => {
    if (!subjects.length) {
      setError('No assigned modules found. Ask an admin or coordinator to assign a module to this instructor first.')
      return
    }

    const targetSubjectId = selectedSubject || subjects[0]?.id || ''
    handleSubjectChange(targetSubjectId)
    setShowModal(true)
    setError('')
    setForm((current) => ({
      ...current,
      subjectId: targetSubjectId
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!questionPdf) {
      setError('Please upload the question PDF')
      return
    }

    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('subjectId', form.subjectId)
      payload.append('dueDate', form.dueDate)
      payload.append('totalMarks', form.totalMarks)
      payload.append('questionPdf', questionPdf)

      const response = await api.post('/assignments', payload)
      const createdAssignment = response.data.assignment

      if (createdAssignment) {
        setAssignments((current) => {
          const nextAssignments = [createdAssignment, ...(current || []).filter((item) => item.id !== createdAssignment.id)]
          return nextAssignments.sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
        })
      }

      showToast({ title: 'Assignment created successfully.' })
      setShowModal(false)
      handleSubjectChange(form.subjectId)
      setForm({
        title: '',
        description: '',
        subjectId: form.subjectId,
        dueDate: '',
        totalMarks: 100
      })
      setQuestionPdf(null)
      await fetchAssignments().catch((fetchError) => {
        if (isRequestCanceled(fetchError)) {
          return
        }
      })
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleGrade = async (submissionId) => {
    try {
      const marksValue = document.getElementById(`grade-${submissionId}`)?.value
      const feedbackValue = document.getElementById(`feedback-${submissionId}`)?.value || ''
      const parsedMarks = Number.parseInt(marksValue, 10)

      if (!Number.isInteger(parsedMarks)) {
        setError('Please enter a valid whole number for marks before saving.')
        return
      }

      if (parsedMarks < 0 || parsedMarks > (showSubmissions?.totalMarks ?? 0)) {
        setError(`Marks must be between 0 and ${showSubmissions?.totalMarks ?? 0}.`)
        return
      }

      await api.patch(`/assignments/submissions/${submissionId}/grade`, {
        obtainedMarks: parsedMarks,
        feedback: feedbackValue
      })

      showToast({ title: 'Submission graded successfully.' })
      if (showSubmissions) {
        const res = await api.get(`/assignments/${showSubmissions.id}`)
        setShowSubmissions(res.data.assignment)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleExport = async (assignmentId, format) => {
    try {
      setExportingAssignmentId(`${assignmentId}:${format}`)
      const response = await api.get(`/assignments/${assignmentId}/export`, {
        params: { format },
        responseType: 'blob'
      })

      const contentDisposition = response.headers['content-disposition'] || ''
      const matchedName = contentDisposition.match(/filename="?(.*?)"?$/i)
      const fileName = matchedName?.[1] || `assignment-grades.${format}`
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to export assignment marks right now')
    } finally {
      setExportingAssignmentId('')
    }
  }

  const handleViewSubmissions = async (assignmentId) => {
    try {
      setError('')
      setSubmissionsLoadingId(assignmentId)
      const res = await api.get(`/assignments/${assignmentId}`)
      setShowSubmissions(res.data.assignment)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load assignment submissions right now')
    } finally {
      setSubmissionsLoadingId('')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title={isCoordinator ? 'Department Assignments' : 'Module Assignments'}
          subtitle={isCoordinator ? 'Create assignments, review submissions, export marks, and send feedback across your department modules.' : 'Upload assignments for a module, review submissions, export marks, and send student feedback.'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Instructor', 'Modules', 'Assignments']}
          actions={[{
            label: 'Add Assignment',
            icon: Plus,
            variant: 'primary',
            disabled: !isCoordinator && subjects.length === 0,
            onClick: openAssignmentModal
          }]}
        />

        <Alert type="error" message={error || assignmentsError} />

        <div className="mb-6 rounded-2xl bg-[--color-bg-card] dark:bg-slate-800 p-4 shadow-sm dark:shadow-slate-900/50">
          <label className="mb-2 block text-sm text-[var(--color-text-muted)]">Module</label>
          <select
            value={selectedSubject}
            onChange={(event) => handleSubjectChange(event.target.value)}
            className="ui-form-input"
          >
            <option value="">{isCoordinator ? 'All Modules' : 'Select Module'}</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name} - {subject.code}
              </option>
            ))}
          </select>
        </div>

        {!isCoordinator && subjects.length === 0 ? (
          <div className="rounded-2xl bg-[--color-bg-card] dark:bg-slate-800 p-10 shadow-sm dark:shadow-slate-900/50">
            <EmptyState
              icon="📝"
              title="No modules available yet"
              description="Your assigned modules will appear here once an admin or coordinator links them to your account."
            />
          </div>
        ) : loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-32" />
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-slate-900/50 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="font-semibold text-[var(--color-heading)]">{assignment.title}</h3>
                      {isOverdue(assignment.dueDate) && (
                        <span className="status-absent rounded-full px-2 py-0.5 text-xs">Overdue</span>
                      )}
                    </div>
                    <p className="mb-3 text-sm text-[var(--color-text-muted)]">{assignment.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-muted)]">
                      <span>📚 {assignment.subject?.name}</span>
                      <span>📅 Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                      <span>🎯 Total: {assignment.totalMarks} marks</span>
                      <span>📋 {assignment._count?.submissions} submissions</span>
                      {assignment.questionPdfUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${assignment.title} - Question PDF`, assignment.questionPdfUrl)}
                          className="font-medium text-[var(--color-role-accent)] hover:underline"
                        >
                          View Question PDF
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:w-[220px] lg:flex-col">
                    <button
                      onClick={() => handleViewSubmissions(assignment.id)}
                      className="status-present rounded-lg border px-3 py-2 text-xs"
                    >
                      {submissionsLoadingId === assignment.id ? 'Loading...' : 'View Submissions'}
                    </button>
                    <button
                      onClick={() => handleExport(assignment.id, 'xlsx')}
                      className="grade-merit rounded-lg border px-3 py-2 text-xs"
                    >
                      {exportingAssignmentId === `${assignment.id}:xlsx` ? 'Exporting...' : 'Export Excel'}
                    </button>
                    <button
                      onClick={() => handleExport(assignment.id, 'pdf')}
                      className="ui-status-badge ui-status-neutral px-3 py-2 text-xs"
                    >
                      {exportingAssignmentId === `${assignment.id}:pdf` ? 'Exporting...' : 'Export PDF'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {assignments.length === 0 && (
              <EmptyState
                icon="📝"
                title="No assignments yet"
                description={isCoordinator ? 'Create the first department assignment to start collecting work.' : 'Create the first assignment for one of your modules to start collecting work.'}
              />
            )}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Add Assignment To Module" onClose={() => setShowModal(false)}>
          <Alert type="error" message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Assignment Title"
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="ui-form-input"
            />
            <textarea
              placeholder="Description"
              required
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="ui-form-input"
            />
            <select
              required
              value={form.subjectId}
              onChange={(event) => setForm({ ...form, subjectId: event.target.value })}
              className="ui-form-input"
            >
              <option value="">Select Module</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} - {subject.code}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <input
                type="datetime-local"
                required
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                className="ui-form-input"
              />
              <input
                type="number"
                placeholder="Total Marks"
                value={form.totalMarks}
                onChange={(event) => setForm({ ...form, totalMarks: parseInt(event.target.value, 10) || 0 })}
                className="ui-form-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-muted)]">Question PDF</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(event) => setQuestionPdf(event.target.files?.[0] || null)}
                className="ui-form-input"
              />
              <p className="mt-1 text-xs text-[var(--color-text-soft)]">Upload the assignment question as a PDF.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showSubmissions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl p-8 w-full max-w-3xl shadow-xl dark:shadow-slate-900/50 max-h-[80vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-[var(--color-card-border)] pb-4 dark:border-slate-700">
              <h2 className="text-xl font-bold text-[var(--color-heading)]">Submissions — {showSubmissions.title}</h2>
              <button onClick={() => setShowSubmissions(null)} className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]">X</button>
            </div>
            <div className="space-y-4">
              {showSubmissions.submissions?.length === 0 && (
                <EmptyState
                  icon="📤"
                  title="No submissions yet"
                  description="Student submissions will appear here as soon as answers are uploaded."
                />
              )}

              {showSubmissions.submissions?.map((submission) => (
                <div
                  key={submission.id}
                  className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)]/60 p-4 dark:border-slate-700 dark:bg-slate-900/50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-[var(--color-heading)]">{submission.student?.user?.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{submission.note || 'No note'}</p>
                      {submission.fileUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${submission.student?.user?.name || 'Student'} - Answer PDF`, submission.fileUrl)}
                          className="mt-2 inline-block text-sm text-[var(--color-role-accent)] hover:underline"
                        >
                          View Answer PDF
                        </button>
                      )}
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                        Submitted: {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                        submission.status === 'GRADED'
                          ? 'status-present'
                          : submission.status === 'LATE'
                            ? 'status-absent'
                            : 'grade-merit'
                      }`}
                      >
                        {submission.status}
                      </span>

                      {submission.feedback && (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                          Feedback sent to student: {submission.feedback}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {submission.status === 'GRADED' ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                          <span className="text-sm font-bold">
                            {submission.obtainedMarks}/{showSubmissions.totalMarks}
                          </span>
                          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Visible to instructors and coordinators only.</p>
                        </div>
                      ) : (
                        <>
                          <input
                            type="number"
                            placeholder="Marks"
                            min="0"
                            max={showSubmissions.totalMarks}
                            id={`grade-${submission.id}`}
                            className="ui-form-input w-24 px-2 py-1 text-sm"
                          />
                          <textarea
                            placeholder="Feedback for student"
                            rows={3}
                            id={`feedback-${submission.id}`}
                            className="ui-form-input w-64 px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => handleGrade(submission.id)}
                            className="ui-role-fill rounded-lg px-3 py-2 text-xs"
                          >
                            Save Marks And Feedback
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl dark:shadow-slate-900/50 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[var(--color-role-accent)] hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
                >
                  X
                </button>
              </div>
            </div>
            {previewLoading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--color-text-muted)]">
                Loading preview...
              </div>
            ) : previewFile.canEmbed ? (
              <iframe
                src={previewFile.url}
                title={previewFile.title}
                className="w-full flex-1"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">
                  This file can be opened in a new tab, but embedded preview is only available for PDFs stored in this app.
                </p>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                >
                  Open PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}

export default Assignments

