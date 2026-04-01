import { useEffect, useState } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { getFriendlyErrorMessage } from '../../utils/errors'
import logger from '../../utils/logger'
const DEFAULT_STATUS = 'PRESENT'
const STATUSES = ['PRESENT', 'ABSENT', 'LATE']

const getToday = () => new Date().toISOString().slice(0, 10)

const statusClasses = {
  PRESENT: 'bg-green-100 text-green-700 border-green-200',
  ABSENT: 'bg-red-100 text-red-700 border-red-200',
  LATE: 'bg-orange-100 text-orange-700 border-orange-200'
}

const Attendance = () => {
  const [subjects, setSubjects] = useState([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [qrCode, setQrCode] = useState(null)
  const [qrExpiry, setQrExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [roster, setRoster] = useState([])
  const [attendance, setAttendance] = useState([])
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, late: 0 })
  const [search, setSearch] = useState('')
  const [exportingFormat, setExportingFormat] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)

  useEffect(() => {
    fetchSubjects()
  }, [])

  useEffect(() => {
    if (!selectedSubject) {
      setRoster([])
      setAttendance([])
      setSummary({ total: 0, present: 0, absent: 0, late: 0 })
      return
    }

    fetchAttendanceWorkspace()
  }, [selectedSubject, selectedDate])

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (fetchError) {
      logger.error(fetchError)
      setError('Unable to load subjects')
    }
  }

  const fetchAttendanceWorkspace = async () => {
    try {
      setLoading(true)
      setError('')

      const [rosterRes, attendanceRes] = await Promise.all([
        api.get(`/attendance/subject/${selectedSubject}/roster`, { params: { date: selectedDate } }),
        api.get(`/attendance/subject/${selectedSubject}`, { params: { date: selectedDate } })
      ])

      setRoster(rosterRes.data.roster)
      setAttendance(attendanceRes.data.attendance)
      setSummary(attendanceRes.data.summary)
    } catch (fetchError) {
      logger.error(fetchError)
      setError(getFriendlyErrorMessage(fetchError, 'Unable to load attendance data.'))
    } finally {
      setLoading(false)
    }
  }

  const generateQR = async () => {
    if (!selectedSubject) {
      setError('Please select a subject first')
      return
    }

    try {
      setError('')
      const res = await api.post('/attendance/generate-qr', { subjectId: selectedSubject })
      setQrCode(res.data.qrCode)
      setQrExpiry(res.data.expiresIn)
      setSuccess('QR code generated successfully')
      setTimeout(() => {
        setQrCode(null)
        setQrExpiry('')
        setSuccess('')
      }, 10 * 60 * 1000)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to generate the QR code right now.'))
    }
  }

  const setStudentStatus = (studentId, status) => {
    setRoster((currentRoster) => currentRoster.map((student) => (
      student.id === studentId ? { ...student, status } : student
    )))
  }

  const applyBulkStatus = (status) => {
    setRoster((currentRoster) => currentRoster.map((student) => ({ ...student, status })))
  }

  const saveManualAttendance = async () => {
    if (!selectedSubject) {
      setError('Please select a subject first')
      return
    }

    if (roster.length === 0) {
      setError('No students are available for this subject')
      return
    }

    try {
      setSaving(true)
      setError('')

      await api.post('/attendance/manual', {
        subjectId: selectedSubject,
        attendanceDate: selectedDate,
        attendanceList: roster.map((student) => ({
          studentId: student.id,
          status: student.status || DEFAULT_STATUS
        }))
      })

      setSuccess('Attendance saved successfully')
      await fetchAttendanceWorkspace()
      setTimeout(() => setSuccess(''), 3000)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to save attendance right now.'))
    } finally {
      setSaving(false)
    }
  }

  const exportAttendanceReport = async (format) => {
    if (!selectedSubject) {
      setError('Please select a subject first')
      return
    }

    try {
      setExportingFormat(format)
      setError('')
      const response = await api.get(`/attendance/subject/${selectedSubject}/export`, {
        params: { date: selectedDate, format },
        responseType: 'blob'
      })

      const contentDisposition = response.headers['content-disposition'] || ''
      const matchedName = contentDisposition.match(/filename="?(.*?)"?$/i)
      const fileName = matchedName?.[1] || `attendance-report.${format}`
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to export the attendance report right now.'))
    } finally {
      setExportingFormat('')
    }
  }

  const filteredRoster = roster.filter((student) => {
    const keyword = debouncedSearch.trim().toLowerCase()
    if (!keyword) return true

    return [
      student.name,
      student.rollNumber,
      student.email,
      student.section || '',
      student.department || ''
    ].some((value) => value.toLowerCase().includes(keyword))
  })

  return (
    <InstructorLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Manage daily attendance with a proper subject roster, QR access, and date-wise records.</p>
        </div>

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Subject</label>
              <select
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value)
                  setQrCode(null)
                  setError('')
                }}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select Subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} - {subject.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Attendance Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={fetchAttendanceWorkspace}
                disabled={!selectedSubject}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg hover:bg-black transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Refresh Attendance
              </button>
            </div>
          </div>
        </div>

        {selectedSubject && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-500">Students</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{roster.length}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-500">Present</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{summary.present}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-500">Absent</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{summary.absent}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-500">Late</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{summary.late}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6 mb-6">
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">QR Attendance</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Students can mark today&apos;s attendance by scanning the QR. Manual save can still adjust the final status list.
                </p>
                <button
                  type="button"
                  onClick={generateQR}
                  className="w-full bg-green-600 text-white py-3 rounded-xl hover:bg-green-700 transition font-medium"
                >
                  Generate QR Code
                </button>
                {qrCode && (
                  <div className="mt-5 text-center">
                    <img src={qrCode} alt="QR Code" className="mx-auto rounded-xl border" style={{ width: 220 }} />
                    <p className="text-xs text-orange-500 mt-3">Expires in {qrExpiry}</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Manual Attendance</h2>
                    <p className="text-sm text-gray-500 mt-1">Mark the correct status for each student in the selected subject and date.</p>
                  </div>
                  <div className="flex gap-2">
                    {STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => applyBulkStatus(status)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border ${statusClasses[status]}`}
                      >
                        Mark All {status}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 mb-4">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, roll number, email, section..."
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={saveManualAttendance}
                    disabled={saving || loading || roster.length === 0}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Attendance'}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAttendanceReport('xlsx')}
                    disabled={loading || !attendance.length || !!exportingFormat}
                    className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exportingFormat === 'xlsx' ? 'Exporting...' : 'Export Excel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportAttendanceReport('pdf')}
                    disabled={loading || !attendance.length || !!exportingFormat}
                    className="bg-slate-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exportingFormat === 'pdf' ? 'Exporting...' : 'Export PDF'}
                  </button>
                </div>

                {loading ? (
                  <LoadingSkeleton rows={5} itemClassName="h-24" />
                ) : filteredRoster.length === 0 ? (
                  <EmptyState
                    icon="🔎"
                    title="No students matched"
                    description="Try another name, roll number, email, or section to find the student you need."
                  />
                ) : (
                  <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                    {filteredRoster.map((student) => (
                      <div key={student.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-800">{student.name}</p>
                            <p className="text-sm text-gray-500 mt-1">
                              {student.rollNumber} • {student.email}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Semester {student.semester}{student.department ? ` • ${student.department}` : ''}{student.section ? ` • Section ${student.section}` : ''}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => setStudentStatus(student.id, status)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                                  student.status === status ? statusClasses[status] : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800">Saved Records</h2>
                <p className="text-sm text-gray-500 mt-1">Showing records for {selectedDate}.</p>
              </div>
              {loading ? (
                <div className="p-6">
                  <LoadingSkeleton rows={4} itemClassName="h-14" />
                </div>
              ) : attendance.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon="🗂️"
                    title="No saved records yet"
                    description="Once attendance is saved for this date, the finalized records will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-sm text-gray-500">
                        <th className="px-6 py-4">Student</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record) => (
                        <tr key={record.id} className="border-t hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-800">{record.student?.user?.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{record.student?.rollNumber}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{record.student?.user?.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{new Date(record.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusClasses[record.status]}`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </InstructorLayout>
  )
}

export default Attendance



