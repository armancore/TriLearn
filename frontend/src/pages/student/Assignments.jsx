import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitForm, setSubmitForm] = useState({ note: '', fileUrl: '' })
  const [submittingId, setSubmittingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [assignmentsRes, submissionsRes] = await Promise.all([
        api.get('/assignments'),
        api.get('/assignments/my-submissions'),
      ])
      setAssignments(assignmentsRes.data.assignments)
      setSubmissions(submissionsRes.data.submissions)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const isSubmitted = (assignmentId) => {
    return submissions.find(s => s.assignmentId === assignmentId)
  }

  const handleSubmit = async (assignmentId) => {
    setError('')
    try {
      await api.post(`/assignments/${assignmentId}/submit`, submitForm)
      setSuccess('Assignment submitted successfully!')
      setSubmittingId(null)
      setSubmitForm({ note: '', fileUrl: '' })
      fetchData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const isOverdue = (dueDate) => new Date() > new Date(dueDate)

  return (
    <StudentLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Assignments</h1>
          <p className="text-gray-500 text-sm mt-1">View and submit your assignments</p>
        </div>

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
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
                          <div className="flex gap-3">
                            <button
                              onClick={() => setSubmittingId(null)}
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
                      {submission.note && (
                        <p className="text-sm text-gray-700 mt-1">Note: {submission.note}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {assignments.length === 0 && (
              <div className="text-center py-12 text-gray-400">No assignments yet</div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentAssignments