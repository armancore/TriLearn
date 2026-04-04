import { useEffect, useMemo, useState } from 'react'
import { BellRing, BookOpenText, ClipboardList, FileText, Percent, TimerReset, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import logger from '../../utils/logger'

const currentMonth = () => new Date().toISOString().slice(0, 7)

const CoordinatorDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjects, setSubjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [notices, setNotices] = useState([])
  const [tickets, setTickets] = useState([])
  const [marksReview, setMarksReview] = useState({ marks: [], stats: { unpublished: 0, published: 0, total: 0 } })
  const [attendanceReports, setAttendanceReports] = useState([])
  const [selectedSemester, setSelectedSemester] = useState('')

  const availableSemesters = useMemo(() => (
    [...new Set(
      subjects
        .map((subject) => Number.parseInt(subject.semester, 10))
        .filter((semester) => Number.isInteger(semester) && semester > 0)
    )].sort((left, right) => left - right)
  ), [subjects])

  useEffect(() => {
    const controller = new AbortController()

    const loadDashboard = async () => {
      try {
        setLoading(true)
        setError('')
        const [subjectsRes, assignmentsRes, noticesRes, ticketsRes, marksRes] = await Promise.all([
          api.get('/subjects', { signal: controller.signal }),
          api.get('/assignments', { signal: controller.signal }),
          api.get('/notices', { params: { page: 1, limit: 5 }, signal: controller.signal }),
          api.get('/attendance/tickets', { signal: controller.signal }),
          api.get('/marks/review', { params: { page: 1, limit: 20 }, signal: controller.signal })
        ])

        if (controller.signal.aborted) {
          return
        }

        const nextSubjects = subjectsRes.data.subjects || []
        const nextSemesters = [...new Set(
          nextSubjects
            .map((subject) => Number.parseInt(subject.semester, 10))
            .filter((semester) => Number.isInteger(semester) && semester > 0)
        )].sort((left, right) => left - right)

        setSubjects(nextSubjects)
        setAssignments(assignmentsRes.data.assignments || [])
        setNotices(noticesRes.data.notices || [])
        setTickets(ticketsRes.data.tickets || [])
        setMarksReview({
          marks: marksRes.data.marks || [],
          stats: marksRes.data.stats || { unpublished: 0, published: 0, total: 0 }
        })

        setSelectedSemester((current) => {
          if (current && nextSemesters.includes(Number.parseInt(current, 10))) {
            return current
          }
          return nextSemesters[0] ? String(nextSemesters[0]) : ''
        })
      } catch (requestError) {
        if (requestError?.code === 'ERR_CANCELED') {
          return
        }

        logger.error('Failed to load coordinator dashboard', requestError)
        setError('Unable to load the coordinator dashboard right now.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!selectedSemester) {
      setAttendanceReports([])
      setAttendanceLoading(false)
      return
    }

    const controller = new AbortController()

    const loadAttendanceReport = async () => {
      try {
        setAttendanceLoading(true)

        const response = await api.get('/attendance/coordinator/department-report', {
          params: {
            month: currentMonth(),
            semester: Number.parseInt(selectedSemester, 10)
          },
          signal: controller.signal
        })

        if (controller.signal.aborted) {
          return
        }

        setAttendanceReports([{
          semester: Number.parseInt(selectedSemester, 10),
          totalStudents: response.data.totalStudents || 0,
          summary: response.data.summary || { present: 0, absent: 0, late: 0 },
          monthlyAverage: response.data.students?.length
            ? Math.round(
              response.data.students.reduce((sum, student) => sum + (student.monthlyAverage || 0), 0) /
              response.data.students.length
            )
            : 0
        }])
      } catch (requestError) {
        if (requestError?.code === 'ERR_CANCELED') {
          return
        }

        logger.error('Failed to load coordinator attendance report', requestError)
        setAttendanceReports([])
        setError('Unable to load the coordinator dashboard right now.')
      } finally {
        if (!controller.signal.aborted) {
          setAttendanceLoading(false)
        }
      }
    }

    void loadAttendanceReport()

    return () => {
      controller.abort()
    }
  }, [selectedSemester])

  const pendingTickets = tickets.filter((ticket) => ticket.status === 'PENDING')
  const unpublishedMarks = marksReview.marks.filter((mark) => !mark.isPublished)
  const recentNotices = [...notices].slice(0, 4)
  const recentAssignments = [...assignments]
    .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
    .slice(0, 4)
  const now = new Date()
  const upcomingAssignments = assignments.filter((assignment) => {
    const dueDate = new Date(assignment.dueDate)
    return dueDate >= now && dueDate <= new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
  })
  const overdueAssignments = assignments.filter((assignment) => new Date(assignment.dueDate) < now)
  const semestersWithStudents = attendanceReports.filter((report) => report.totalStudents > 0)
  const strongestAttendance = useMemo(() => (
    [...attendanceReports]
      .filter((report) => report.totalStudents > 0)
      .sort((left, right) => right.monthlyAverage - left.monthlyAverage)
      .slice(0, 4)
  ), [attendanceReports])
  const semesterSubjectMap = useMemo(() => (
    availableSemesters.map((semester) => {
      const semesterSubjects = subjects.filter((subject) => Number.parseInt(subject.semester, 10) === semester)
      return {
        semester,
        subjectCount: semesterSubjects.length,
        assignmentCount: assignments.filter((assignment) => Number.parseInt(assignment.subject?.semester, 10) === semester).length,
        unpublishedCount: unpublishedMarks.filter((mark) => Number.parseInt(mark.subject?.semester, 10) === semester).length
      }
    })
  ), [assignments, availableSemesters, subjects, unpublishedMarks])
  const coordinatorActionBoard = [
    {
      title: 'Admission queue',
      value: notices.length,
      meta: 'Recent communication cadence'
    },
    {
      title: 'Upcoming deadlines',
      value: upcomingAssignments.length,
      meta: `${overdueAssignments.length} overdue assignments`
    },
    {
      title: 'Pending ticket reviews',
      value: pendingTickets.length,
      meta: `${tickets.length} total department tickets`
    },
    {
      title: 'Results awaiting publish',
      value: unpublishedMarks.length,
      meta: `${marksReview.stats.published || 0} already visible to students`
    }
  ]

  const stats = [
    { title: 'Department Modules', value: subjects.length, icon: BookOpenText, iconClassName: 'from-blue-500 to-cyan-600', trend: user?.coordinator?.department || 'Department scope', trendLabel: 'coordinator control' },
    { title: 'Pending Requests', value: pendingTickets.length, icon: ClipboardList, iconClassName: 'from-amber-500 to-orange-600', trend: `${tickets.length} total`, trendLabel: 'absence tickets' },
    { title: 'Unpublished Results', value: marksReview.stats.unpublished || 0, icon: FileText, iconClassName: 'from-violet-500 to-purple-600', trend: `${marksReview.stats.published || 0} published`, trendLabel: 'exam records' },
    { title: 'Semesters Reporting', value: semestersWithStudents.length, icon: Percent, iconClassName: 'from-emerald-500 to-green-600', trend: currentMonth(), trendLabel: 'attendance month' },
    { title: 'Students In Scope', value: attendanceReports[0]?.totalStudents || 0, icon: Users, iconClassName: 'from-slate-700 to-slate-900', trend: selectedSemester ? `Semester ${selectedSemester}` : 'Awaiting filter', trendLabel: 'current report' },
    { title: 'Due This Week', value: upcomingAssignments.length, icon: TimerReset, iconClassName: 'from-rose-500 to-red-600', trend: `${overdueAssignments.length} overdue`, trendLabel: 'assignment watch' }
  ]

  if (loading) {
    return (
      <CoordinatorLayout>
        <div className="p-4 md:p-8">
          <LoadingSkeleton rows={6} itemClassName="h-28" />
        </div>
      </CoordinatorLayout>
    )
  }

  return (
    <CoordinatorLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Coordinator Dashboard"
          subtitle="Manage your department’s notices, routines, attendance, assignments, and result publishing from one workspace."
          breadcrumbs={['Coordinator', 'Dashboard']}
        />

        {error ? (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : null}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {stats.map((stat) => (
            <StatCard
              key={stat.title}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              iconClassName={stat.iconClassName}
              trend={stat.trend}
              trendLabel={stat.trendLabel}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Coordinator Action Board</h2>
                  <p className="text-sm text-slate-500">The fastest way to explain department workload and where attention is needed right now.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  Live department snapshot
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {coordinatorActionBoard.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.title}</p>
                    <p className="mt-3 text-2xl font-black text-slate-900">{item.value}</p>
                    <p className="mt-2 text-sm text-slate-500">{item.meta}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Department Attendance Pulse</h2>
                  <p className="text-sm text-slate-500">Average monthly attendance for the selected semester in the current reporting month.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedSemester}
                    onChange={(event) => setSelectedSemester(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {availableSemesters.length === 0 ? (
                      <option value="">No semesters</option>
                    ) : (
                      availableSemesters.map((semester) => (
                        <option key={semester} value={semester}>
                          Semester {semester}
                        </option>
                      ))
                    )}
                  </select>
                  <Link to="/coordinator/attendance" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                    Open attendance
                  </Link>
                </div>
              </div>

              {attendanceLoading ? (
                <LoadingSkeleton rows={1} itemClassName="h-28" />
              ) : strongestAttendance.length === 0 ? (
                <EmptyState
                  icon="📊"
                  title="No attendance reports yet"
                  description="Monthly department attendance summaries will appear here once records are available."
                />
              ) : (
                <div className="space-y-3">
                  {strongestAttendance.map((report) => (
                    <div key={report.semester} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Semester {report.semester}</p>
                          <p className="mt-1 text-xs text-slate-500">{report.totalStudents} students in report</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${report.monthlyAverage >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {report.monthlyAverage}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${report.monthlyAverage >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(report.monthlyAverage, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {report.summary.present} present • {report.summary.absent} absent • {report.summary.late} late
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Semester Delivery Map</h2>
                  <p className="text-sm text-slate-500">Show how modules, assignments, and unpublished results are distributed across the department.</p>
                </div>
                <Link to="/coordinator/subjects" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Open subjects
                </Link>
              </div>

              {semesterSubjectMap.length === 0 ? (
                <EmptyState
                  icon="🧭"
                  title="No semester map yet"
                  description="Once subjects are configured for the department, this semester breakdown will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {semesterSubjectMap.map((entry) => (
                    <div key={entry.semester} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Semester {entry.semester}</p>
                          <p className="mt-1 text-xs text-slate-500">{entry.subjectCount} modules configured</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                            {entry.assignmentCount} assignments
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.unpublishedCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {entry.unpublishedCount} unpublished results
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Pending Absence Requests</h2>
                  <p className="text-sm text-slate-500">Students waiting for a department-level response.</p>
                </div>
                <Link to="/coordinator/requests" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Review requests
                </Link>
              </div>

              {pendingTickets.length === 0 ? (
                <EmptyState
                  icon="📬"
                  title="No pending requests"
                  description="New student absence requests will surface here when they need your review."
                />
              ) : (
                <div className="space-y-3">
                  {pendingTickets.slice(0, 4).map((ticket) => (
                    <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">{ticket.student?.user?.name || 'Student'}</p>
                      <p className="mt-1 text-xs text-slate-500">{ticket.attendance?.subject?.name} ({ticket.attendance?.subject?.code})</p>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{ticket.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Result Publishing Queue</h2>
                  <p className="text-sm text-slate-500">Exam records still hidden from students.</p>
                </div>
                <Link to="/coordinator/marks" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Open results
                </Link>
              </div>

              {marksReview.marks.length === 0 ? (
                <EmptyState
                  icon="📝"
                  title="No result records yet"
                  description="Marks awaiting publication will appear here after instructors enter them."
                />
              ) : (
                <div className="space-y-3">
                  {unpublishedMarks.slice(0, 4).map((mark) => (
                    <div key={mark.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">{mark.student?.user?.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{mark.subject?.name} ({mark.subject?.code})</p>
                      <p className="mt-2 text-sm text-slate-600">{mark.examType} • {mark.obtainedMarks}/{mark.totalMarks}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent Notices</h2>
                  <p className="text-sm text-slate-500">The latest department and campus announcements.</p>
                </div>
                <Link to="/coordinator/notices" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Manage notices
                </Link>
              </div>

              {recentNotices.length === 0 ? (
                <EmptyState
                  icon="📣"
                  title="No notices yet"
                  description="Create a department notice to keep instructors and students aligned."
                />
              ) : (
                <div className="space-y-3">
                  {recentNotices.map((notice) => (
                    <div key={notice.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                          {notice.type}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(notice.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">{notice.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{notice.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Assignment Watchlist</h2>
                  <p className="text-sm text-slate-500">Closest department assignment deadlines.</p>
                </div>
                <Link to="/coordinator/assignments" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Open assignments
                </Link>
              </div>

              {recentAssignments.length === 0 ? (
                <EmptyState
                  icon="🗂️"
                  title="No assignments yet"
                  description="Upcoming module tasks will show here once instructors or coordinators create them."
                />
              ) : (
                <div className="space-y-3">
                  {recentAssignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{assignment.subject?.name} ({assignment.subject?.code})</p>
                      <p className="mt-2 text-sm text-slate-600">Due {new Date(assignment.dueDate).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Deadline Pressure</h2>
                  <p className="text-sm text-slate-500">Upcoming and overdue assignment signals make the dashboard feel operational instead of decorative.</p>
                </div>
                <Link to="/coordinator/assignments" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Open assignments
                </Link>
              </div>

              {assignments.length === 0 ? (
                <EmptyState
                  icon="⏱️"
                  title="No assignment pressure yet"
                  description="Assignment urgency indicators will show up here once department modules start posting coursework."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Due This Week</p>
                    <p className="mt-3 text-3xl font-black text-slate-900">{upcomingAssignments.length}</p>
                    <p className="mt-2 text-sm text-slate-600">Assignments approaching their due date in the next 7 days.</p>
                  </div>
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Overdue</p>
                    <p className="mt-3 text-3xl font-black text-slate-900">{overdueAssignments.length}</p>
                    <p className="mt-2 text-sm text-slate-600">Department assignments whose due date has already passed.</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </CoordinatorLayout>
  )
}

export default CoordinatorDashboard
