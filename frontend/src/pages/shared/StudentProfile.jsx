import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLES } from '../../constants/roles'
import api, { openFileUrl } from '../../utils/api'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import InstructorLayout from '../../layouts/InstructorLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const tabsBase = ['info', 'attendance', 'marks', 'assignments', 'tickets']
const disciplinaryTypes = ['WARNING', 'MISCONDUCT', 'CHEATING', 'ABSENCE_VIOLATION', 'PROPERTY_DAMAGE', 'OTHER']
const severities = ['MINOR', 'MODERATE', 'SEVERE']

const gradeTone = (grade) => {
  if (grade === 'A+' || grade === 'A') return 'grade-pass'
  if (grade === 'B+' || grade === 'B') return 'grade-merit'
  if (grade === 'C+' || grade === 'C') return 'grade-average'
  return 'grade-fail'
}

const valueOrDash = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  return value
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-')
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-')
const formatLabel = (value) => String(value || '').replaceAll('_', ' ')

const initialsFromName = (name) => String(name || 'Student')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'S'

const attendanceTone = (percentage) => {
  if (percentage < 75) return 'text-red-600'
  if (percentage <= 85) return 'text-amber-600'
  return 'text-green-600'
}

const statusClass = (status, map) => `ui-status-badge ${map[status] || 'ui-status-neutral'}`

const assignmentStatusClasses = {
  GRADED: 'ui-status-success',
  SUBMITTED: 'ui-status-info',
  LATE: 'ui-status-warning'
}

const ticketStatusClasses = {
  APPROVED: 'ui-status-success',
  REJECTED: 'ui-status-danger',
  PENDING: 'ui-status-warning'
}

const emptyDisciplinaryForm = () => ({
  type: 'WARNING',
  severity: 'MINOR',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  action: ''
})

const StudentProfile = () => {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const { studentId } = useParams()
  const isAdmin = user?.role === ROLES.ADMIN
  const canManageDisciplinary = isAdmin || user?.role === ROLES.COORDINATOR
  const Layout = user?.role === ROLES.ADMIN
    ? AdminLayout
    : user?.role === ROLES.COORDINATOR
      ? CoordinatorLayout
      : InstructorLayout

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [activeMarkExamType, setActiveMarkExamType] = useState('')
  const [showDisciplinaryForm, setShowDisciplinaryForm] = useState(false)
  const [disciplinaryForm, setDisciplinaryForm] = useState(emptyDisciplinaryForm)
  const [savingRecord, setSavingRecord] = useState(false)
  const [deletingRecordId, setDeletingRecordId] = useState('')

  const profilePath = `/students/${studentId}/profile`
  const disciplinaryBase = `/admin/students/${studentId}/disciplinary`

  const loadProfile = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get(profilePath, { signal })
      setProfile(response.data)
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      setError(getFriendlyErrorMessage(requestError, 'Unable to load student profile right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [profilePath])

  useEffect(() => {
    const controller = new AbortController()
    void loadProfile(controller.signal)
    return () => controller.abort()
  }, [loadProfile])

  const markExamTypes = Object.keys(profile?.marks || {})

  useEffect(() => {
    if (markExamTypes.length === 0) {
      setActiveMarkExamType('')
      return
    }

    if (!activeMarkExamType || !markExamTypes.includes(activeMarkExamType)) {
      setActiveMarkExamType(markExamTypes[0])
    }
  }, [activeMarkExamType, markExamTypes])

  const refreshProfile = useCallback(async () => {
    const controller = new AbortController()
    await loadProfile(controller.signal)
  }, [loadProfile])

  const createRecord = async (event) => {
    event.preventDefault()

    try {
      setSavingRecord(true)
      setError('')
      await api.post(disciplinaryBase, {
        type: disciplinaryForm.type,
        severity: disciplinaryForm.severity,
        date: disciplinaryForm.date,
        description: disciplinaryForm.description,
        action: disciplinaryForm.action
      })
      showToast({ title: 'Disciplinary record added.' })
      setDisciplinaryForm(emptyDisciplinaryForm())
      setShowDisciplinaryForm(false)
      await refreshProfile()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to add the disciplinary record right now.'))
    } finally {
      setSavingRecord(false)
    }
  }

  const deleteRecord = async (recordId) => {
    try {
      setDeletingRecordId(recordId)
      setError('')
      await api.delete(`${disciplinaryBase}/${recordId}`)
      showToast({ title: 'Disciplinary record deleted.' })
      await refreshProfile()
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to delete the disciplinary record right now.'))
    } finally {
      setDeletingRecordId('')
    }
  }

  const openSubmissionFile = async (fileUrl) => {
    try {
      setError('')
      await openFileUrl(fileUrl)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to open the submitted file right now.'))
    }
  }

  const student = profile?.student
  const studentUser = student?.user
  const tabs = canManageDisciplinary ? [...tabsBase, 'disciplinary'] : tabsBase
  const pageClassName = user?.role === ROLES.ADMIN
    ? 'admin-page p-4 md:p-8'
    : user?.role === ROLES.COORDINATOR
      ? 'coordinator-page p-4 md:p-8'
      : 'p-4 md:p-8'

  return (
    <Layout>
      <div className={pageClassName}>
        <PageHeader
          title="Student profile"
          subtitle={studentUser?.name ?? ''}
          actions={[
            { label: 'Back', variant: 'secondary', onClick: () => navigate(-1) }
          ]}
        />

        {loading ? <LoadingSkeleton rows={8} /> : null}
        {error ? <Alert type="error" message={error} /> : null}

        {profile ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5 shadow-sm dark:shadow-slate-900/50">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-role-accent)] text-xl font-black text-white">
                    {initialsFromName(studentUser?.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--color-heading)]">{studentUser?.name || 'Student'}</h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-[var(--color-text-muted)]">
                      <span>{valueOrDash(student?.rollNumber)}</span>
                      <span>{valueOrDash(student?.department)}</span>
                      <span>Semester {valueOrDash(student?.semester)}</span>
                      <span>Section {valueOrDash(student?.section)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`ui-status-badge ${studentUser?.isActive ? 'ui-status-success' : 'ui-status-danger'}`}>
                    {studentUser?.isActive ? 'Active' : 'Suspended'}
                  </span>
                  <Link to={user?.role === ROLES.INSTRUCTOR ? '/instructor' : '/admin/students'} className="text-sm font-semibold text-[var(--color-role-accent)] hover:underline">
                    Student list
                  </Link>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Overall attendance" value={`${profile.summary?.overallAttendancePct ?? 0}%`} />
              <StatCard label="Avg GPA" value={profile.summary?.avgGradePoint ?? 0} />
              <StatCard label="Assignments submitted" value={`${profile.summary?.submittedAssignments ?? 0}/${profile.summary?.totalAssignments ?? 0}`} />
              {canManageDisciplinary ? (
                <StatCard label="Disciplinary count" value={profile.summary?.totalDisciplinaryRecords ?? 0} />
              ) : null}
            </section>

            <div className="border-b border-[var(--color-card-border)]">
              <div className="flex gap-5 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold capitalize transition ${
                      activeTab === tab
                        ? 'border-[var(--color-role-accent)] text-[var(--color-role-accent)]'
                        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-heading)]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'info' ? <InfoPanel student={student} studentUser={studentUser} /> : null}
            {activeTab === 'attendance' ? <AttendancePanel attendance={profile.attendance || []} /> : null}
            {activeTab === 'marks' ? (
              <MarksPanel
                marks={profile.marks || {}}
                examTypes={markExamTypes}
                activeExamType={activeMarkExamType}
                setActiveExamType={setActiveMarkExamType}
              />
            ) : null}
            {activeTab === 'assignments' ? (
              <AssignmentsPanel
                assignments={[...(profile.assignments || []), ...(profile.taskSubmissions || [])].sort((left, right) => (
                  new Date(right.submittedAt || 0) - new Date(left.submittedAt || 0)
                ))}
                onOpenSubmissionFile={openSubmissionFile}
              />
            ) : null}
            {activeTab === 'tickets' ? <TicketsPanel tickets={profile.absenceTickets || []} /> : null}
            {activeTab === 'disciplinary' && canManageDisciplinary ? (
              <DisciplinaryPanel
                records={profile.disciplinary || []}
                canCreate={canManageDisciplinary}
                canDelete={isAdmin}
                showForm={showDisciplinaryForm}
                setShowForm={setShowDisciplinaryForm}
                form={disciplinaryForm}
                setForm={setDisciplinaryForm}
                savingRecord={savingRecord}
                deletingRecordId={deletingRecordId}
                onSubmit={createRecord}
                onDelete={deleteRecord}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Layout>
  )
}

const StatCard = ({ label, value }) => (
  <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5 shadow-sm dark:shadow-slate-900/50">
    <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
    <p className="mt-3 text-3xl font-black text-[var(--color-heading)]">{value}</p>
  </div>
)

const InfoPanel = ({ student, studentUser }) => {
  const fields = [
    ['Email', studentUser?.email],
    ['Phone', studentUser?.phone],
    ['Date of birth', formatDate(student?.dateOfBirth)],
    ['Blood group', student?.bloodGroup],
    ['Department', student?.department],
    ['Semester', student?.semester],
    ['Section', student?.section],
    ['Roll number', student?.rollNumber],
    ['Enrolled at', formatDate(student?.enrolledAt)],
    ['Father name', student?.fatherName],
    ['Father phone', student?.fatherPhone],
    ['Mother name', student?.motherName],
    ['Mother phone', student?.motherPhone],
    ['Guardian name', student?.localGuardianName],
    ['Guardian phone', student?.localGuardianPhone],
    ['Guardian address', student?.localGuardianAddress],
    ['Permanent address', student?.permanentAddress],
    ['Temporary address', student?.temporaryAddress]
  ]

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">{label}</p>
          <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{valueOrDash(value)}</p>
        </div>
      ))}
    </section>
  )
}

const AttendancePanel = ({ attendance }) => {
  if (attendance.length === 0) {
    return <EmptyState title="No attendance summary" description="Attendance records for this student will appear here." />
  }

  return (
    <TableShell>
      <table className="w-full min-w-[760px]">
        <thead className="bg-[var(--color-surface-muted)]">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            <th className="px-5 py-4">Subject</th>
            <th className="px-5 py-4">Code</th>
            <th className="px-5 py-4">Total</th>
            <th className="px-5 py-4">Present</th>
            <th className="px-5 py-4">Absent</th>
            <th className="px-5 py-4">Late</th>
            <th className="px-5 py-4">Attendance %</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map((item) => (
            <tr key={`${item.subjectCode}-${item.subjectName}`} className="border-t border-[var(--color-card-border)]">
              <td className="px-5 py-4 text-sm font-semibold text-[var(--color-heading)]">{valueOrDash(item.subjectName)}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(item.subjectCode)}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{item.total}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{item.present}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{item.absent}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{item.late}</td>
              <td className={`px-5 py-4 text-sm font-black ${attendanceTone(item.percentage)}`}>{item.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  )
}

const MarksPanel = ({ marks, examTypes, activeExamType, setActiveExamType }) => {
  const rows = marks[activeExamType] || []
  const totals = rows.reduce((summary, row) => ({
    obtained: summary.obtained + Number(row.obtainedMarks || 0),
    total: summary.total + Number(row.totalMarks || 0),
    gpa: summary.gpa + Number(row.gradePoint || 0)
  }), { obtained: 0, total: 0, gpa: 0 })
  const percentage = totals.total > 0 ? Math.round((totals.obtained / totals.total) * 100) : 0
  const avgGpa = rows.length > 0 ? (totals.gpa / rows.length).toFixed(2) : '0.00'

  if (examTypes.length === 0) {
    return <EmptyState title="No marks found" description="Marks for this student will appear after records are entered." />
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {examTypes.map((examType) => (
          <button
            key={examType}
            type="button"
            onClick={() => setActiveExamType(examType)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeExamType === examType
                ? 'bg-[var(--color-role-accent)] text-white'
                : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-heading)]'
            }`}
          >
            {formatLabel(examType)}
          </button>
        ))}
      </div>

      <TableShell>
        <table className="w-full min-w-[900px]">
          <thead className="bg-[var(--color-surface-muted)]">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              <th className="px-5 py-4">Subject</th>
              <th className="px-5 py-4">Code</th>
              <th className="px-5 py-4">Obtained</th>
              <th className="px-5 py-4">Total</th>
              <th className="px-5 py-4">%</th>
              <th className="px-5 py-4">Grade</th>
              <th className="px-5 py-4">GPA</th>
              <th className="px-5 py-4">Published</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${activeExamType}-${row.subjectCode}`} className="border-t border-[var(--color-card-border)]">
                <td className="px-5 py-4 text-sm font-semibold text-[var(--color-heading)]">{valueOrDash(row.subjectName)}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(row.subjectCode)}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{row.obtainedMarks}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{row.totalMarks}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{row.percentage}%</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gradeTone(row.grade)}`}>{row.grade}</span>
                </td>
                <td className="px-5 py-4 text-sm font-bold text-[var(--color-heading)]">{Number(row.gradePoint || 0).toFixed(1)}</td>
                <td className="px-5 py-4">
                  <span className={`ui-status-badge ${row.isPublished ? 'ui-status-success' : 'ui-status-neutral'}`}>
                    {row.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length > 1 ? (
              <tr className="border-t border-[var(--color-card-border)] bg-[var(--color-surface-muted)] font-bold text-[var(--color-heading)]">
                <td className="px-5 py-4 text-sm" colSpan={2}>Total</td>
                <td className="px-5 py-4 text-sm">{totals.obtained}</td>
                <td className="px-5 py-4 text-sm">{totals.total}</td>
                <td className="px-5 py-4 text-sm">{percentage}%</td>
                <td className="px-5 py-4 text-sm">-</td>
                <td className="px-5 py-4 text-sm">{avgGpa}</td>
                <td className="px-5 py-4 text-sm">-</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableShell>
    </section>
  )
}

const AssignmentsPanel = ({ assignments, onOpenSubmissionFile }) => {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('')

  if (assignments.length === 0) {
    return <EmptyState title="No assignments found" description="Assignment submissions for this student will appear here." />
  }

  return (
    <TableShell>
      <table className="w-full min-w-[980px]">
        <thead className="bg-[var(--color-surface-muted)]">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            <th className="px-5 py-4">Type</th>
            <th className="px-5 py-4">Assignment</th>
            <th className="px-5 py-4">Subject</th>
            <th className="px-5 py-4">Due date</th>
            <th className="px-5 py-4">Submitted</th>
            <th className="px-5 py-4">Marks</th>
            <th className="px-5 py-4">Status</th>
            <th className="px-5 py-4">Submission</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => {
            const isSelected = selectedSubmissionId === assignment.id
            return (
              <Fragment key={assignment.id}>
                <tr className="border-t border-[var(--color-card-border)]">
                  <td className="px-5 py-4">
                    <span className="ui-status-badge ui-status-neutral">{assignment.kind === 'TASK' ? 'Task' : 'Assignment'}</span>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--color-heading)]">{valueOrDash(assignment.assignmentTitle)}</td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                    <p>{valueOrDash(assignment.subjectName)}</p>
                    <p className="text-xs">{valueOrDash(assignment.subjectCode)}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{formatDate(assignment.dueDate)}</td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{formatDateTime(assignment.submittedAt)}</td>
                  <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                    {assignment.kind === 'TASK' ? '-' : `${valueOrDash(assignment.obtainedMarks)}/${valueOrDash(assignment.totalMarks)}`}
                  </td>
                  <td className="px-5 py-4">
                    <span className={statusClass(assignment.status, assignmentStatusClasses)}>{assignment.status || 'NOT SUBMITTED'}</span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedSubmissionId(isSelected ? '' : assignment.id)}
                      className="rounded-lg border border-[var(--color-card-border)] px-3 py-2 text-sm font-medium text-[var(--color-role-accent)] transition hover:bg-[var(--color-surface-muted)]"
                    >
                      {isSelected ? 'Hide submission' : 'View submission'}
                    </button>
                  </td>
                </tr>
                {isSelected ? (
                  <tr className="border-t border-[var(--color-card-border)] bg-[var(--color-surface-muted)]/60">
                    <td colSpan={8} className="px-5 py-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">Submitted note</p>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{valueOrDash(assignment.note)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">Feedback</p>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{valueOrDash(assignment.feedback)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">Answer file</p>
                          {assignment.fileUrl ? (
                            <button
                              type="button"
                              onClick={() => onOpenSubmissionFile(assignment.fileUrl)}
                              className="mt-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-95"
                            >
                              Open submitted file
                            </button>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--color-text-muted)]">No file attached</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

const TicketsPanel = ({ tickets }) => {
  if (tickets.length === 0) {
    return <EmptyState title="No absence tickets" description="Absence ticket history for this student will appear here." />
  }

  return (
    <TableShell>
      <table className="w-full min-w-[820px]">
        <thead className="bg-[var(--color-surface-muted)]">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            <th className="px-5 py-4">Date</th>
            <th className="px-5 py-4">Subject</th>
            <th className="px-5 py-4">Reason</th>
            <th className="px-5 py-4">Status</th>
            <th className="px-5 py-4">Response</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="border-t border-[var(--color-card-border)]">
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{formatDate(ticket.date)}</td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                <p className="font-semibold text-[var(--color-heading)]">{valueOrDash(ticket.subjectName)}</p>
                <p className="text-xs">{valueOrDash(ticket.subjectCode)}</p>
              </td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(ticket.reason)}</td>
              <td className="px-5 py-4">
                <span className={statusClass(ticket.status, ticketStatusClasses)}>{ticket.status}</span>
              </td>
              <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(ticket.response)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  )
}

const DisciplinaryPanel = ({
  records,
  canCreate,
  canDelete,
  showForm,
  setShowForm,
  form,
  setForm,
  savingRecord,
  deletingRecordId,
  onSubmit,
  onDelete
}) => (
  <section className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">Disciplinary records</h2>
        <p className="text-sm text-[var(--color-text-muted)]">Incidents and actions recorded by staff.</p>
      </div>
      {canCreate ? (
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-95"
        >
          {showForm ? 'Close form' : 'Add record'}
        </button>
      ) : null}
    </div>

    {showForm && canCreate ? (
      <form onSubmit={onSubmit} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="ui-form-label">Type</span>
            <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="ui-form-input">
              {disciplinaryTypes.map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="ui-form-label">Severity</span>
            <select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))} className="ui-form-input">
              {severities.map((severity) => <option key={severity} value={severity}>{formatLabel(severity)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="ui-form-label">Date</span>
            <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="ui-form-input" required />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="ui-form-label">Description</span>
            <textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="ui-form-input" required />
          </label>
          <label className="block">
            <span className="ui-form-label">Action taken</span>
            <textarea rows={4} value={form.action} onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))} className="ui-form-input" />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={savingRecord} className="rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {savingRecord ? 'Saving...' : 'Save record'}
          </button>
        </div>
      </form>
    ) : null}

    {records.length === 0 ? (
      <EmptyState title="No disciplinary records" description="Disciplinary records for this student will appear here." />
    ) : (
      <TableShell>
        <table className="w-full min-w-[940px]">
          <thead className="bg-[var(--color-surface-muted)]">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Type</th>
              <th className="px-5 py-4">Severity</th>
              <th className="px-5 py-4">Description</th>
              <th className="px-5 py-4">Action taken</th>
              <th className="px-5 py-4">Recorded by</th>
              {canDelete ? <th className="px-5 py-4">Delete</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-[var(--color-card-border)] align-top">
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{formatDate(record.date)}</td>
                <td className="px-5 py-4 text-sm font-semibold text-[var(--color-heading)]">{formatLabel(record.type)}</td>
                <td className="px-5 py-4"><span className="ui-status-badge ui-status-warning">{record.severity}</span></td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(record.description)}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">{valueOrDash(record.action)}</td>
                <td className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                  <p className="font-semibold text-[var(--color-heading)]">{valueOrDash(record.recordedByName)}</p>
                  <p className="text-xs">{valueOrDash(record.recordedByRole)}</p>
                </td>
                {canDelete ? (
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => onDelete(record.id)}
                      disabled={deletingRecordId === record.id}
                      aria-label="Delete disciplinary record"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!canDelete ? (
          <p className="border-t border-[var(--color-card-border)] px-5 py-3 text-sm text-[var(--color-text-muted)]">
            Records can only be deleted by an admin.
          </p>
        ) : null}
      </TableShell>
    )}
  </section>
)

const TableShell = ({ children }) => (
  <section className="overflow-hidden rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/50">
    <div className="overflow-x-auto">{children}</div>
  </section>
)

export default StudentProfile
