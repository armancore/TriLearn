import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import InstructorLayout from '../../layouts/InstructorLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import StatusBadge from '../../components/StatusBadge'
import PageHeader from '../../components/PageHeader'
import QrScanPanel from '../../components/QrScanPanel'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { getFriendlyErrorMessage } from '../../utils/errors'
import logger from '../../utils/logger'
const DEFAULT_STATUS = 'PRESENT'
const STATUSES = ['PRESENT', 'ABSENT', 'LATE']

const getToday = () => new Date().toISOString().slice(0, 10)
const getCurrentMonth = () => new Date().toISOString().slice(0, 7)

const statusClasses = {
  PRESENT: 'bg-green-100 text-green-700 border-green-200',
  ABSENT: 'bg-red-100 text-red-700 border-red-200',
  LATE: 'bg-orange-100 text-orange-700 border-orange-200'
}

const Attendance = () => {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const [subjects, setSubjects] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || '')
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [selectedSemester, setSelectedSemester] = useState(searchParams.get('semester') || (isCoordinator ? '1' : ''))
  const [selectedSection, setSelectedSection] = useState(searchParams.get('section') || '')
  const [qrCode, setQrCode] = useState(null)
  const [qrExpiry, setQrExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [roster, setRoster] = useState([])
  const [attendance, setAttendance] = useState([])
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0, late: 0 })
  const [monthlyDays, setMonthlyDays] = useState([])
  const [monthlyStudents, setMonthlyStudents] = useState([])
  const [monthlyMeta, setMonthlyMeta] = useState({ monthLabel: '', totalStudents: 0, totalRecords: 0, department: '', semester: '', section: '' })
  const [coordinatorRecords, setCoordinatorRecords] = useState([])
  const [search, setSearch] = useState('')
  const [exportingFormat, setExportingFormat] = useState('')
  const [scanningStudentId, setScanningStudentId] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 250)

  useEffect(() => {
    fetchSubjects()
  }, [])

  useEffect(() => {
    if (isCoordinator) {
      setSelectedSubject('')
      if (!selectedSemester) {
        setCoordinatorRecords([])
        setMonthlyStudents([])
        setMonthlyMeta({ monthLabel: '', totalStudents: 0, totalRecords: 0, department: '', semester: '', section: '' })
        setSummary({ total: 0, present: 0, absent: 0, late: 0 })
        return
      }
      fetchCoordinatorDepartmentReport()
      return
    }

    if (!selectedSubject || !selectedSemester || !selectedSection) {
      setRoster([])
      setAttendance([])
      setMonthlyDays([])
      setMonthlyStudents([])
      setMonthlyMeta({ monthLabel: '', totalStudents: 0, totalRecords: 0, department: '', semester: '', section: '' })
      setSummary({ total: 0, present: 0, absent: 0, late: 0 })
      return
    }

    fetchAttendanceWorkspace()
  }, [isCoordinator, selectedSubject, selectedDate, selectedMonth, selectedSemester, selectedSection])

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
        api.get(`/attendance/subject/${selectedSubject}/roster`, {
          params: {
            date: selectedDate,
            semester: selectedSemester,
            section: selectedSection
          }
        }),
        api.get(`/attendance/subject/${selectedSubject}`, {
          params: {
            date: selectedDate,
            semester: selectedSemester,
            section: selectedSection
          }
        })
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

  const fetchMonthlyAttendanceReport = async () => {
    try {
      setLoading(true)
      setError('')

      const res = await api.get(`/attendance/subject/${selectedSubject}/monthly-report`, {
        params: { month: selectedMonth }
      })

      setMonthlyDays(res.data.days)
      setMonthlyStudents(res.data.students)
      setMonthlyMeta({
        monthLabel: res.data.monthLabel,
        totalStudents: res.data.totalStudents,
        totalRecords: res.data.totalRecords
      })
      setSummary(res.data.summary)
      setRoster([])
      setAttendance([])
    } catch (fetchError) {
      logger.error(fetchError)
      setError(getFriendlyErrorMessage(fetchError, 'Unable to load the monthly attendance report.'))
    } finally {
      setLoading(false)
    }
  }

  const fetchCoordinatorDepartmentReport = async () => {
    if (!selectedSemester) {
      setError('Please select a semester to load the department report.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const res = await api.get('/attendance/coordinator/department-report', {
        params: {
          month: selectedMonth,
          semester: selectedSemester,
          section: selectedSection || undefined
        }
      })

      setMonthlyStudents(res.data.students)
      setCoordinatorRecords(res.data.records)
      setMonthlyMeta({
        monthLabel: res.data.monthLabel,
        totalStudents: res.data.totalStudents,
        totalRecords: res.data.records.length,
        department: res.data.department,
        semester: String(res.data.semester),
        section: res.data.section
      })
      setSummary(res.data.summary)
      setMonthlyDays([])
      setRoster([])
      setAttendance([])
    } catch (fetchError) {
      logger.error(fetchError)
      setError(getFriendlyErrorMessage(fetchError, 'Unable to load the department attendance report.'))
    } finally {
      setLoading(false)
    }
  }

  const generateQR = async () => {
    if (!selectedSubject) {
      setError('Please select a subject first')
      return
    }

    if (!selectedSemester || !selectedSection) {
      setError('Please select the semester and section for this attendance session')
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
        semester: parseInt(selectedSemester, 10),
        section: selectedSection,
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
      if (!isCoordinator) {
        setError('Please select a subject first')
        return
      }
    }

    try {
      setExportingFormat(format)
      setError('')
      const response = isCoordinator
        ? await api.get('/attendance/coordinator/department-report/export', {
            params: {
              month: selectedMonth,
              semester: selectedSemester,
              section: selectedSection || undefined,
              format
            },
            responseType: 'blob'
          })
        : await api.get(`/attendance/subject/${selectedSubject}/export`, {
            params: {
              date: selectedDate,
              format
            },
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

  const scanStudentIdCard = async (qrData) => {
    if (!isCoordinator && !selectedSubject) {
      setError('Please select a subject before scanning a student ID card.')
      return
    }

    try {
      setScanningStudentId(true)
      setError('')

      const payload = isCoordinator
        ? { qrData }
        : {
            qrData,
            subjectId: selectedSubject,
            attendanceDate: selectedDate
          }

      const res = await api.post('/attendance/scan-student-id', payload)
      setSuccess(res.data.message)

      if (isCoordinator) {
        await fetchCoordinatorDepartmentReport()
      } else {
        await fetchAttendanceWorkspace()
      }

      setTimeout(() => setSuccess(''), 3000)
    } catch (requestError) {
      logger.error(requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to mark attendance from the student ID card right now.'))
    } finally {
      setScanningStudentId(false)
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

  const filteredMonthlyStudents = monthlyStudents.filter((student) => {
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

  const filteredCoordinatorRecords = coordinatorRecords.filter((record) => {
    const keyword = debouncedSearch.trim().toLowerCase()
    if (!keyword) return true

    return [
      record.student.name,
      record.student.rollNumber,
      record.student.email,
      record.subject.name,
      record.subject.code,
      record.student.section || ''
    ].some((value) => value.toLowerCase().includes(keyword))
  })

  return (
    <Layout>
      <div className="p-8">
        <PageHeader
          title="Attendance"
          subtitle={isCoordinator
            ? 'Review department attendance by semester and section with monthly averages and a full record list.'
            : 'Select the module, semester, and section before marking daily attendance or reviewing saved subject records.'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Instructor', 'Attendance']}
          actions={[{
            label: isCoordinator ? 'Load Department Report' : 'Refresh Attendance',
            icon: RefreshCw,
            variant: 'secondary',
            onClick: isCoordinator ? fetchCoordinatorDepartmentReport : fetchAttendanceWorkspace,
            disabled: isCoordinator ? !selectedSemester : !selectedSubject || !selectedSemester || !selectedSection
          }]}
        />

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className={`grid grid-cols-1 gap-4 ${isCoordinator ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
            {isCoordinator ? (
              <>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Semester</label>
                  <select
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {Array.from({ length: 8 }, (_, index) => (
                      <option key={index + 1} value={String(index + 1)}>
                        Semester {index + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Section</label>
                  <input
                    type="text"
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value.toUpperCase())}
                    placeholder="All sections or A/B/C"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Module</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => {
                    setSelectedSubject(e.target.value)
                    const subject = subjects.find((item) => item.id === e.target.value)
                    if (subject?.semester) {
                      setSelectedSemester(String(subject.semester))
                    }
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
            )}
            {!isCoordinator && (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Semester</label>
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select Semester</option>
                  {Array.from({ length: 8 }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      Semester {index + 1}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!isCoordinator && (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Section</label>
                <input
                  type="text"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value.toUpperCase())}
                  placeholder="A / B / C"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
            {isCoordinator ? (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Report Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-600 mb-2">Attendance Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
            <div className="flex items-end">
              <button
                type="button"
                onClick={isCoordinator ? fetchCoordinatorDepartmentReport : fetchAttendanceWorkspace}
                disabled={isCoordinator ? !selectedSemester : !selectedSubject || !selectedSemester || !selectedSection}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg hover:bg-black transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCoordinator ? 'Load Department Report' : 'Refresh Attendance'}
              </button>
            </div>
          </div>
        </div>

        {(isCoordinator || (selectedSubject && selectedSemester && selectedSection)) && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-500">Students</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{isCoordinator ? monthlyMeta.totalStudents : roster.length}</p>
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
                <p className="text-sm text-gray-500">{isCoordinator ? 'Recorded Entries' : 'Late'}</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{isCoordinator ? monthlyMeta.totalRecords : summary.late}</p>
              </div>
            </div>

            {!isCoordinator && (
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
                    <p className="text-sm text-gray-500 mt-1">Mark the correct status for each student in the selected module, semester, section, and date.</p>
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
            )}

            <div className="mb-6">
              <QrScanPanel
                title={isCoordinator ? 'Scan Student ID Card' : 'Scan Student ID Card For Subject'}
                description={isCoordinator
                  ? 'Coordinator can scan the student ID QR to mark attendance through the active Student QR time window.'
                  : 'Instructor can scan the student ID QR to mark the selected subject attendance as present for the chosen date.'}
                submitLabel="Mark From ID Card"
                onSubmit={scanStudentIdCard}
                busy={scanningStudentId}
                accentClassName="focus:ring-green-500"
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{isCoordinator ? 'Monthly Attendance Report' : 'Saved Records'}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {isCoordinator
                      ? `Showing ${monthlyMeta.department || 'department'} attendance for semester ${monthlyMeta.semester || selectedSemester}${monthlyMeta.section ? `, section ${monthlyMeta.section}` : ''} in ${monthlyMeta.monthLabel || selectedMonth}.`
                      : `Showing records for ${selectedDate}.`}
                  </p>
                </div>
                <span className="ui-status-badge ui-status-neutral">
                  {isCoordinator ? filteredMonthlyStudents.length : attendance.length} records
                </span>
              </div>
              {loading ? (
                <div className="p-6">
                  <LoadingSkeleton rows={4} itemClassName="h-14" />
                </div>
              ) : isCoordinator ? (
                filteredMonthlyStudents.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon="📅"
                      title="No monthly records found"
                      description="Select a subject and month with recorded attendance to review the full student report."
                    />
                  </div>
                ) : (
                  <div className="p-6">
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
                        onClick={() => exportAttendanceReport('xlsx')}
                        disabled={!monthlyStudents.length || !!exportingFormat}
                        className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {exportingFormat === 'xlsx' ? 'Exporting...' : 'Export Excel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportAttendanceReport('pdf')}
                        disabled={!monthlyStudents.length || !!exportingFormat}
                        className="bg-slate-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {exportingFormat === 'pdf' ? 'Exporting...' : 'Export PDF'}
                      </button>
                    </div>
                    <div className="overflow-x-auto max-h-[520px]">
                      <table className="w-full min-w-[980px]">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr className="text-left text-sm text-gray-500">
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Roll</th>
                            <th className="px-4 py-3">Section</th>
                            <th className="px-4 py-3">Present</th>
                            <th className="px-4 py-3">Absent</th>
                            <th className="px-4 py-3">Late</th>
                            <th className="px-4 py-3">Monthly Average</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMonthlyStudents.map((student) => (
                            <tr key={student.id} className="border-t border-slate-200 transition-colors hover:bg-blue-50/30">
                              <td className="px-4 py-4">
                                <p className="font-semibold text-slate-900">{student.name}</p>
                                <p className="text-xs text-gray-500 mt-1">{student.email}</p>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-600">{student.rollNumber}</td>
                              <td className="px-4 py-4 text-sm text-gray-600">{student.section || '-'}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-green-600">{student.present}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-red-600">{student.absent}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-orange-500">{student.late}</td>
                              <td className="px-4 py-4 text-sm font-semibold text-gray-800">{student.monthlyAverage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-6 border-t pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-gray-800">Attendance Record List</h3>
                          <p className="text-sm text-gray-500 mt-1">Detailed monthly entries for every student in the selected department group.</p>
                        </div>
                        <span className="ui-status-badge ui-status-neutral">{filteredCoordinatorRecords.length} records</span>
                      </div>
                      <div className="overflow-x-auto mt-4 max-h-[420px]">
                        <table className="w-full min-w-[980px]">
                          <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr className="text-left text-sm text-gray-500">
                              <th className="px-4 py-3">Student</th>
                              <th className="px-4 py-3">Roll</th>
                              <th className="px-4 py-3">Subject</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCoordinatorRecords.map((record) => (
                              <tr key={record.id} className="border-t border-slate-200 transition-colors hover:bg-blue-50/30">
                                <td className="px-4 py-4">
                                  <p className="font-semibold text-slate-900">{record.student.name}</p>
                                  <p className="text-xs text-gray-500 mt-1">{record.student.email}</p>
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-600">{record.student.rollNumber}</td>
                                <td className="px-4 py-4 text-sm text-gray-600">
                                  {record.subject.name}
                                  <span className="text-xs text-gray-400 ml-2">{record.subject.code}</span>
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-600">{new Date(record.date).toLocaleDateString()}</td>
                                <td className="px-4 py-4">
                                  <StatusBadge status={record.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              ) : attendance.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon="🗂️"
                    title="No saved records yet"
                    description="Once attendance is saved for this date, the finalized records will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full min-w-[720px]">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="text-left text-sm text-gray-500">
                        <th className="px-6 py-4">Student</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((record) => (
                        <tr key={record.id} className="border-t border-slate-200 transition-colors hover:bg-blue-50/30">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900">{record.student?.user?.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{record.student?.rollNumber}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{record.student?.user?.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{new Date(record.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <StatusBadge status={record.status} />
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
    </Layout>
  )
}

export default Attendance



