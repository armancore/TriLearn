import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import api, { fetchFileBlob } from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitForm, setSubmitForm] = useState({ note: '' })
  const [answerPdf, setAnswerPdf] = useState(null)
  const [submittingId, setSubmittingId] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const { showToast } = useToast()
  const [previewFile, setPreviewFile] = useState(null)

  useEffect(() => {
    return () => {
      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }
    }
  }, [previewFile])

  const openPreview = async (title, fileUrl) => {
    if (!fileUrl) {
      setSubmitError('This file preview is unavailable because the file link is invalid.')
      return
    }

    try {
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
      setSubmitError('Unable to open this file right now.')
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void fetchData(controller.signal)
    return () => controller.abort()
  }, [])

  const fetchData = async (signal) => {
    try {
      setLoadError('')
      const [assignmentsRes, submissionsRes] = await Promise.all([
        api.get('/assignments', { signal }),
        api.get('/assignments/my-submissions', { signal }),
      ])
      setAssignments(assignmentsRes.data.assignments)
      setSubmissions(submissionsRes.data.submissions)
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error('Failed to load student assignments', error)
      setLoadError(error.response?.data?.message || 'Unable to load assignments right now.')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  const isSubmitted = (assignmentId) => {
    return submissions.find(s => s.assignmentId === assignmentId)
  }

  const handleSubmit = async (assignmentId) => {
    setSubmitError('')
    if (!answerPdf) {
      setSubmitError('Please upload your answer PDF')
      return
    }
    try {
      const payload = new FormData()
      payload.append('note', submitForm.note)
      if (answerPdf) payload.append('answerPdf', answerPdf)

      await api.post(`/assignments/${assignmentId}/submit`, payload)
      showToast({ title: 'Assignment submitted successfully.' })
      setSubmittingId(null)
      setSubmitForm({ note: '' })
      setAnswerPdf(null)
      void fetchData()
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <StudentLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Assignments"
          subtitle="View module assignments, submit your work, and read instructor feedback after review."
          breadcrumbs={['Student', 'Assignments']}
        />

        <Alert type="error" message={loadError} />

        {loading ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => {
              const submission = isSubmitted(assignment.id)
              const overdue = isOverdue(assignment.dueDate)

              return (
                <div key={assignment.id} className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-slate-900/50 p-6">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-[--color-text] dark:text-slate-100">{assignment.title}</h3>
                        {overdue && !submission && (
                          <span className="text-xs bg-accent-100 text-accent-700 px-2 py-0.5 rounded-full">Overdue</span>
                        )}
                        {submission && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${submission.status === 'GRADED' ? 'bg-primary-100 text-primary' :
                              submission.status === 'LATE' ? 'bg-accent-100 text-accent-700' :
                              'bg-primary-100 text-primary'}`}>
                            {submission.status}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[--color-text-muted] dark:text-slate-400 mb-3">{assignment.description}</p>
                      <div className="flex gap-4 text-xs text-[--color-text-muted] dark:text-slate-400">
                        <span>📚 {assignment.subject?.name}</span>
                        <span>📅 Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                        <span>🎯 Total: {assignment.totalMarks} marks</span>
                        {assignment.questionPdfUrl && (
                          <button
                            type="button"
                            onClick={() => openPreview(`${assignment.title} - Question PDF`, assignment.questionPdfUrl)}
                            className="text-primary font-medium hover:underline"
                          >
                            View Question PDF
                          </button>
                        )}
                        {submission?.feedback && (
                          <span className="text-primary font-medium">
                            Feedback available
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Submit section */}
                  {!submission && (
                    <div className="mt-4 pt-4 border-t">
                      {submittingId === assignment.id ? (
                        <div className="space-y-3">
                          <Alert type="error" message={submittingId === assignment.id ? submitError : ''} />
                          <textarea
                            placeholder="Add a note (optional)"
                            rows={2}
                            value={submitForm.note}
                            onChange={(e) => setSubmitForm({ ...submitForm, note: e.target.value })}
                            className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <div>
                            <label className="block text-sm text-[--color-text-muted] dark:text-slate-400 mb-1">Answer PDF</label>
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => setAnswerPdf(e.target.files?.[0] || null)}
                              className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => { setSubmittingId(null); setAnswerPdf(null); setSubmitError('') }}
                              className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-400 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSubmit(assignment.id)}
                              className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary-700 font-medium"
                            >
                              Submit Assignment
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSubmittingId(assignment.id); setSubmitError('') }}
                          className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 transition"
                        >
                          Submit Assignment
                        </button>
                      )}
                    </div>
                  )}

                  {/* Already submitted */}
                  {submission && (
                    <div className="mt-4 pt-4 border-t bg-[--color-bg] dark:bg-slate-900 rounded-xl p-3">
                      <p className="text-xs text-[--color-text-muted] dark:text-slate-400">
                        Submitted on {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                      {submission.fileUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${assignment.title} - Submitted PDF`, submission.fileUrl)}
                          className="text-sm text-primary hover:underline mt-1 inline-block"
                        >
                          View Submitted PDF
                        </button>
                      )}
                      {submission.note && (
                        <p className="text-sm text-gray-700 mt-1">Note: {submission.note}</p>
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
            {assignments.length === 0 && (
              <EmptyState
                icon="🗂️"
                title="No assignments yet"
                description="Assignments from your instructors will appear here when they are published."
              />
            )}
          </div>
        )}
      </div>

      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl dark:shadow-slate-900/50 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-[--color-text] dark:text-slate-100">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (previewFile?.objectUrl) {
                      window.URL.revokeObjectURL(previewFile.objectUrl)
                    }
                    setPreviewFile(null)
                  }}
                  className="text-gray-400 hover:text-[--color-text-muted] dark:text-slate-400 text-xl"
                >
                  X
                </button>
              </div>
            </div>
            {previewFile.canEmbed ? (
              <iframe
                src={previewFile.url}
                title={previewFile.title}
                className="w-full flex-1"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-[--color-text-muted] dark:text-slate-400">
                  This file can be opened in a new tab, but embedded preview is only available for PDFs stored in this app.
                </p>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  Open PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentAssignments




