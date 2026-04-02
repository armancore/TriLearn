import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import api, { resolveFileUrl } from '../../utils/api'
import logger from '../../utils/logger'
const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitForm, setSubmitForm] = useState({ note: '' })
  const [answerPdf, setAnswerPdf] = useState(null)
  const [submittingId, setSubmittingId] = useState(null)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const [previewFile, setPreviewFile] = useState(null)

  const openPreview = (title, fileUrl) => {
    const resolvedUrl = resolveFileUrl(fileUrl)
    if (!resolvedUrl) {
      setError('This file preview is unavailable because the file link is invalid.')
      return
    }

    setPreviewFile({ title, url: resolvedUrl })
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [assignmentsRes, submissionsRes] = await Promise.all([
        api.get('/assignments'),
        api.get('/assignments/my-submissions'),
      ])
      setAssignments(assignmentsRes.data.assignments)
      setSubmissions(submissionsRes.data.submissions)
    } catch (error) {
      logger.error('Failed to load student assignments', error)
    } finally {
      setLoading(false)
    }
  }

  const isSubmitted = (assignmentId) => {
    return submissions.find(s => s.assignmentId === assignmentId)
  }

  const handleSubmit = async (assignmentId) => {
    setError('')
    if (!answerPdf) {
      setError('Please upload your answer PDF')
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
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <StudentLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Assignments"
          subtitle="View and submit your assignments"
          breadcrumbs={['Student', 'Assignments']}
        />

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {loading ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => {
              const submission = isSubmitted(assignment.id)
              const overdue = isOverdue(assignment.dueDate)

              return (
                <div key={assignment.id} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-800">{assignment.title}</h3>
                        {overdue && !submission && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Overdue</span>
                        )}
                        {submission && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${submission.status === 'GRADED' ? 'bg-green-100 text-green-700' :
                              submission.status === 'LATE' ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'}`}>
                            {submission.status}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{assignment.description}</p>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>📚 {assignment.subject?.name}</span>
                        <span>📅 Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                        <span>🎯 Total: {assignment.totalMarks} marks</span>
                        {assignment.questionPdfUrl && (
                          <button
                            type="button"
                            onClick={() => openPreview(`${assignment.title} - Question PDF`, assignment.questionPdfUrl)}
                            className="text-blue-600 font-medium hover:underline"
                          >
                            View Question PDF
                          </button>
                        )}
                        {submission?.obtainedMarks !== null && submission?.obtainedMarks !== undefined && (
                          <span className="text-green-600 font-medium">
                            ✅ Scored: {submission.obtainedMarks}/{assignment.totalMarks}
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
                          <textarea
                            placeholder="Add a note (optional)"
                            rows={2}
                            value={submitForm.note}
                            onChange={(e) => setSubmitForm({ ...submitForm, note: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Answer PDF</label>
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => setAnswerPdf(e.target.files?.[0] || null)}
                              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => { setSubmittingId(null); setAnswerPdf(null) }}
                              className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSubmit(assignment.id)}
                              className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm hover:bg-purple-700 font-medium"
                            >
                              Submit Assignment
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSubmittingId(assignment.id); setError('') }}
                          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 transition"
                        >
                          Submit Assignment
                        </button>
                      )}
                    </div>
                  )}

                  {/* Already submitted */}
                  {submission && (
                    <div className="mt-4 pt-4 border-t bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">
                        Submitted on {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                      {submission.fileUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${assignment.title} - Submitted PDF`, submission.fileUrl)}
                          className="text-sm text-purple-600 hover:underline mt-1 inline-block"
                        >
                          View Submitted PDF
                        </button>
                      )}
                      {submission.note && (
                        <p className="text-sm text-gray-700 mt-1">Note: {submission.note}</p>
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
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-purple-600 hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={previewFile.url}
              title={previewFile.title}
              className="w-full flex-1"
              sandbox="allow-downloads"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentAssignments



