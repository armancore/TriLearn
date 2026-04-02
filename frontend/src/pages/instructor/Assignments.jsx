import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import Alert from '../../components/Alert'
import PageHeader from '../../components/PageHeader'
import InstructorLayout from '../../layouts/InstructorLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import useApi from '../../hooks/useApi'
import api, { resolveFileUrl } from '../../utils/api'

const Assignments = () => {
  const [showModal, setShowModal] = useState(false)
  const [showSubmissions, setShowSubmissions] = useState(null)
  const [form, setForm] = useState({
    title: '', description: '', subjectId: '',
    dueDate: '', totalMarks: 100
  })
  const [questionPdf, setQuestionPdf] = useState(null)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const [previewFile, setPreviewFile] = useState(null)
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

    setPreviewFile({ title, url: resolvedUrl })
  }

  useEffect(() => {
    fetchAssignments()
    fetchSubjects()
  }, [])

  const fetchAssignments = async () => {
    await executeAssignments(
      () => api.get('/assignments'),
      {
        transform: (response) => response.data.assignments
      }
    )
  }

  const fetchSubjects = async () => {
    await executeSubjects(
      () => api.get('/subjects'),
      {
        transform: (response) => response.data.subjects
      }
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
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
      if (questionPdf) payload.append('questionPdf', questionPdf)

      await api.post('/assignments', payload)
      showToast({ title: 'Assignment created successfully.' })
      setShowModal(false)
      setForm({ title: '', description: '', subjectId: '', dueDate: '', totalMarks: 100 })
      setQuestionPdf(null)
      fetchAssignments()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleGrade = async (submissionId, obtainedMarks) => {
    try {
      await api.patch(`/assignments/submissions/${submissionId}/grade`, { obtainedMarks: parseInt(obtainedMarks) })
      showToast({ title: 'Submission graded successfully.' })
      if (showSubmissions) {
        const res = await api.get(`/assignments/${showSubmissions.id}`)
        setShowSubmissions(res.data.assignment)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <InstructorLayout>
      <div className="p-4 md:p-8">

        <PageHeader
          title="Assignments"
          subtitle="Create and manage assignments"
          breadcrumbs={['Instructor', 'Assignments']}
          actions={[{ label: 'Create Assignment', icon: Plus, variant: 'primary', onClick: () => { setShowModal(true); setError('') } }]}
        />

        <Alert type="error" message={error} />

        {/* Assignments List */}
        {loading ? (
          <LoadingSpinner text="Loading assignments..." />
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-800">{assignment.title}</h3>
                      {isOverdue(assignment.dueDate) && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Overdue</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{assignment.description}</p>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>📚 {assignment.subject?.name}</span>
                      <span>📅 Due: {new Date(assignment.dueDate).toLocaleDateString()}</span>
                      <span>🎯 Total: {assignment.totalMarks} marks</span>
                      <span>📋 {assignment._count?.submissions} submissions</span>
                      {assignment.questionPdfUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${assignment.title} - Question PDF`, assignment.questionPdfUrl)}
                          className="text-green-600 font-medium hover:underline"
                        >
                          View Question PDF
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const res = await api.get(`/assignments/${assignment.id}`)
                      setShowSubmissions(res.data.assignment)
                    }}
                    className="ml-4 text-xs bg-green-50 text-green-600 px-3 py-1 rounded-lg hover:bg-green-100"
                  >
                    View Submissions
                  </button>
                </div>
              </div>
            ))}
            {assignments.length === 0 && (
              <EmptyState
                icon="📝"
                title="No assignments yet"
                description="Create the first assignment for one of your subjects to start collecting work."
              />
            )}
          </div>
        )}

      </div>

      {/* Create Modal */}
      {showModal && (
        <Modal title="Create Assignment" onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text" placeholder="Assignment Title" required
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <textarea
                placeholder="Description" required rows={3}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <select
                required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} - {s.code}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <input
                  type="datetime-local" required
                  value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="number" placeholder="Total Marks"
                  value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Question PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={(e) => setQuestionPdf(e.target.files?.[0] || null)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Upload the assignment question as a PDF.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 font-medium">
                  Create
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Submissions Modal */}
      {showSubmissions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                Submissions — {showSubmissions.title}
              </h2>
              <button onClick={() => setShowSubmissions(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-4">
              {showSubmissions.submissions?.length === 0 && (
                <EmptyState
                  icon="📤"
                  title="No submissions yet"
                  description="Student submissions will appear here as soon as answers are uploaded."
                />
              )}
              {showSubmissions.submissions?.map((sub) => (
                <div key={sub.id} className="border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-800">{sub.student?.user?.name}</p>
                      <p className="text-sm text-gray-500 mt-1">{sub.note || 'No note'}</p>
                      {sub.fileUrl && (
                        <button
                          type="button"
                          onClick={() => openPreview(`${sub.student?.user?.name || 'Student'} - Answer PDF`, sub.fileUrl)}
                          className="text-sm text-green-600 hover:underline mt-2 inline-block"
                        >
                          View Answer PDF
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted: {new Date(sub.submittedAt).toLocaleDateString()}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block
                        ${sub.status === 'GRADED' ? 'bg-green-100 text-green-700' :
                          sub.status === 'LATE' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'}`}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.status === 'GRADED' ? (
                        <span className="text-sm font-bold text-green-600">
                          {sub.obtainedMarks}/{showSubmissions.totalMarks}
                        </span>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Marks"
                            min="0"
                            max={showSubmissions.totalMarks}
                            id={`grade-${sub.id}`}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => {
                              const val = document.getElementById(`grade-${sub.id}`).value
                              handleGrade(sub.id, val)
                            }}
                            className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-green-700"
                          >
                            Grade
                          </button>
                        </div>
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
              <h2 className="text-lg font-semibold text-gray-800">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-green-600 hover:underline"
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

    </InstructorLayout>
  )
}

export default Assignments


