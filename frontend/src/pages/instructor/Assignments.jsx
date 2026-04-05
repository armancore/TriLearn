import { useCallback, useEffect, useState } from 'react'
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
import useApi from '../../hooks/useApi'
import api, { isEmbeddablePdfUrl, resolveFileUrl } from '../../utils/api'

const Assignments = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const [searchParams] = useSearchParams()
  const [showModal, setShowModal] = useState(false)
  const [showSubmissions, setShowSubmissions] = useState(null)
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || '')
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
  const { showToast } = useToast()
  const {
    data: assignments = [],
    loading,
    execute: executeAssignments
  } = useApi({ initialData: [], initialLoading: true })
  const {
    data: subjects = [],
    execute: executeSubjects
  } = useApi({ initialData: [] })

  const openPreview = (title, fileUrl) => {
    const resolvedUrl = resolveFileUrl(fileUrl)
    if (!resolvedUrl) {
      setError('This file preview is unavailable because the file link is invalid.')
      return
    }

    setPreviewFile({ title, url: resolvedUrl, canEmbed: isEmbeddablePdfUrl(resolvedUrl) })
  }

  const fetchAssignments = useCallback(async () => {
    await executeAssignments(
      (signal) => api.get('/assignments', {
        signal,
        params: selectedSubject ? { subjectId: selectedSubject } : undefined
      }),
      {
        transform: (response) => response.data.assignments
      }
    )
  }, [executeAssignments, selectedSubject])

  const fetchSubjects = useCallback(async () => {
    await executeSubjects(
      (signal) => api.get('/subjects', { signal }),
      {
        transform: (response) => response.data.subjects
      }
    )
  }, [executeSubjects])

  useEffect(() => {
    void fetchAssignments()
  }, [fetchAssignments])

  useEffect(() => {
    void fetchSubjects()
  }, [fetchSubjects])

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

      await api.post('/assignments', payload)
      showToast({ title: 'Assignment created successfully.' })
      setShowModal(false)
      setForm({
        title: '',
        description: '',
        subjectId: selectedSubject || '',
        dueDate: '',
        totalMarks: 100
      })
      setQuestionPdf(null)
      await fetchAssignments()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleGrade = async (submissionId) => {
    try {
      const marksValue = document.getElementById(`grade-${submissionId}`)?.value
      const feedbackValue = document.getElementById(`feedback-${submissionId}`)?.value || ''

      await api.patch(`/assignments/submissions/${submissionId}/grade`, {
        obtainedMarks: parseInt(marksValue, 10),
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
            onClick: () => {
              setShowModal(true)
              setError('')
              setForm((current) => ({
                ...current,
                subjectId: selectedSubject || current.subjectId
              }))
            }
          }]}
        />

        <Alert type="error" message={error} />

        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm text-[var(--color-text-muted)]">Module</label>
          <select
            value={selectedSubject}
            onChange={(event) => setSelectedSubject(event.target.value)}
            className="ui-form-input"
          >
            <option value="">All Modules</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name} - {subject.code}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-32" />
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="bg-white rounded-2xl shadow-sm p-6">
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
                      onClick={async () => {
                        const res = await api.get(`/assignments/${assignment.id}`)
                        setShowSubmissions(res.data.assignment)
                      }}
                      className="status-present rounded-lg border px-3 py-2 text-xs"
                    >
                      View Submissions
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-3xl shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[var(--color-heading)]">Submissions — {showSubmissions.title}</h2>
              <button onClick={() => setShowSubmissions(null)} className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]">✕</button>
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
                <div key={submission.id} className="border rounded-xl p-4">
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
                        <div className="grade-merit mt-3 rounded-lg px-3 py-2 text-sm">
                          Feedback sent to student: {submission.feedback}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {submission.status === 'GRADED' ? (
                        <div className="status-present rounded-lg px-3 py-2 text-right">
                          <span className="text-sm font-bold">
                            {submission.obtainedMarks}/{showSubmissions.totalMarks}
                          </span>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Visible to instructors and coordinators only.</p>
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
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl flex flex-col overflow-hidden">
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
                  onClick={() => setPreviewFile(null)}
                  className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
                >
                  ✕
                </button>
              </div>
            </div>
            {previewFile.canEmbed ? (
              <iframe
                src={previewFile.url}
                title={previewFile.title}
                className="w-full flex-1"
                sandbox="allow-downloads"
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
