import { useState, useEffect } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import Modal from '../../components/Modal'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import logger from '../../utils/logger'
const Marks = () => {
  const [subjects, setSubjects] = useState([])
  const [marks, setMarks] = useState([])
  const [students, setStudents] = useState([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    studentId: '', subjectId: '', examType: 'INTERNAL',
    totalMarks: 100, obtainedMarks: '', remarks: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchSubjects()
  }, [])

  useEffect(() => {
    if (selectedSubject) {
      fetchMarks()
    }
  }, [selectedSubject, page])

  useEffect(() => {
    if (!showModal) return

    if (form.subjectId) {
      fetchStudents(form.subjectId)
      return
    }

    setStudents([])
  }, [form.subjectId, showModal])

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (error) {
      logger.error(error)
    }
  }

  const fetchStudents = async (subjectId) => {
    if (!subjectId) {
      setStudents([])
      return
    }

    try {
      const res = await api.get(`/marks/subject/${subjectId}/students`)
      setStudents(res.data.students)
    } catch (error) {
      logger.error(error)
      setStudents([])
    }
  }

  const fetchMarks = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/marks/subject/${selectedSubject}?page=${page}&limit=${limit}`)
      setMarks(res.data.marks)
      setTotal(res.data.total)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/marks', {
        ...form,
        totalMarks: parseInt(form.totalMarks),
        obtainedMarks: parseInt(form.obtainedMarks)
      })
      setSuccess('Marks added successfully!')
      setShowModal(false)
      setForm({ studentId: '', subjectId: '', examType: 'INTERNAL', totalMarks: 100, obtainedMarks: '', remarks: '' })
      if (selectedSubject) fetchMarks()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  return (
    <InstructorLayout>
      <div className="p-8">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Marks</h1>
            <p className="text-gray-500 text-sm mt-1">Add and view student exam marks</p>
          </div>
          <button
            onClick={() => {
              setShowModal(true)
              setError('')
              setForm((current) => ({
                ...current,
                subjectId: selectedSubject || current.subjectId
              }))
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
          >
            + Add Marks
          </button>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {/* Subject Filter */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <select
            value={selectedSubject}
            onChange={(e) => {
              setSelectedSubject(e.target.value)
              setPage(1)
            }}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select a subject to view marks</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name} - {s.code}</option>
            ))}
          </select>
        </div>

        {/* Marks Table */}
        {selectedSubject && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <LoadingSpinner text="Loading marks..." />
            ) : (
              <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-6 py-4">Student</th>
                    <th className="px-6 py-4">Exam Type</th>
                    <th className="px-6 py-4">Obtained</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Percentage</th>
                    <th className="px-6 py-4">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {marks.map((mark) => (
                    <tr key={mark.id} className="border-t hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {mark.student?.user?.name}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={mark.examType} />
                      </td>
                      <td className="px-6 py-4 text-gray-700 font-medium">{mark.obtainedMarks}</td>
                      <td className="px-6 py-4 text-gray-500">{mark.totalMarks}</td>
                      <td className="px-6 py-4">
                        <span className={`font-medium ${
                          (mark.obtainedMarks / mark.totalMarks) >= 0.7 ? 'text-green-600' :
                          (mark.obtainedMarks / mark.totalMarks) >= 0.4 ? 'text-orange-500' :
                          'text-red-600'}`}>
                          {((mark.obtainedMarks / mark.totalMarks) * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{mark.remarks || '-'}</td>
                    </tr>
                  ))}
                  {marks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                        No marks added for this subject yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
              <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
              </>
            )}
          </div>
        )}

      </div>

      {/* Add Marks Modal */}
      {showModal && (
        <Modal title="Add Marks" onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Select Student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, studentId: '' })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Select Subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="INTERNAL">Internal</option>
                <option value="MIDTERM">Midterm</option>
                <option value="FINAL">Final</option>
                <option value="PRACTICAL">Practical</option>
              </select>
              <div className="flex gap-3">
                <input type="number" placeholder="Total Marks" required
                  value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input type="number" placeholder="Obtained Marks" required
                  value={form.obtainedMarks} onChange={(e) => setForm({ ...form, obtainedMarks: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <input type="text" placeholder="Remarks (optional)"
                value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 font-medium">Add Marks</button>
              </div>
            </form>
        </Modal>
      )}

    </InstructorLayout>
  )
}

export default Marks



