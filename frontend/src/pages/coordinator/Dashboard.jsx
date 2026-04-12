import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BellRing,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  FileText,
  Percent,
  Sparkles,
  TimerReset,
  Users
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import logger from '../../utils/logger'

const currentMonth = () => new Date().toISOString().slice(0, 7)

const panelClassName = 'ui-card rounded-[1.75rem] p-5 md:p-6'

const formatDate = (value, options) => {
  if (!value) return 'No date'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date'
  }

  return parsed.toLocaleDateString(undefined, options)
}

const formatDateTime = (value) => {
  if (!value) return 'No schedule'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid schedule'
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const getAssignmentTone = (dueDate, now) => {
  const parsedDueDate = new Date(dueDate)
  if (Number.isNaN(parsedDueDate.getTime())) {
    return {
      badge: 'ui-status-badge ui-status-neutral',
      label: 'Unscheduled'
    }
  }

  if (parsedDueDate < now) {
    return {
      badge: 'ui-status-badge ui-status-danger',
      label: 'Overdue'
    }
  }

  if (parsedDueDate <= new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))) {
    return {
      badge: 'ui-status-badge ui-status-warning',
      label: 'Due soon'
    }
  }

  return {
    badge: 'ui-status-badge ui-status-success',
    label: 'Scheduled'
  }
}

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
        const [subjectsRes, assignmentsRes, noticesRes, ticketsRes, marksRes] = await Promise.allSettled([
          api.get('/subjects', { params: { page: 1, limit: 100 }, signal: controller.signal }),
          api.get('/assignments', { params: { page: 1, limit: 100 }, signal: controller.signal }),
          api.get('/notices', { params: { page: 1, limit: 5 }, signal: controller.signal }),
          api.get('/attendance/tickets', { params: { page: 1, limit: 100 }, signal: controller.signal }),
          api.get('/marks/review', { params: { page: 1, limit: 100 }, signal: controller.signal })
        ])

        if (controller.signal.aborted) {
          return
        }

        const getResponseData = (result, fallback) => (result.status === 'fulfilled' ? result.value.data : fallback)

        const subjectsData = getResponseData(subjectsRes, { subjects: [] })
        const assignmentsData = getResponseData(assignmentsRes, { assignments: [] })
        const noticesData = getResponseData(noticesRes, { notices: [] })
        const ticketsData = getResponseData(ticketsRes, { tickets: [] })
        const marksData = getResponseData(marksRes, { marks: [], stats: { unpublished: 0, published: 0, total: 0 } })

        const nextSubjects = subjectsData.subjects || []
        const nextSemesters = [...new Set(
          nextSubjects
            .map((subject) => Number.parseInt(subject.semester, 10))
            .filter((semester) => Number.isInteger(semester) && semester > 0)
        )].sort((left, right) => left - right)

        setSubjects(nextSubjects)
        setAssignments(assignmentsData.assignments || [])
        setNotices(noticesData.notices || [])
        setTickets(ticketsData.tickets || [])
        setMarksReview({
          marks: marksData.marks || [],
          stats: marksData.stats || { unpublished: 0, published: 0, total: 0 }
        })

        if ([subjectsRes, assignmentsRes, noticesRes, ticketsRes, marksRes].every((result) => result.status === 'rejected')) {
          setError('Unable to load the coordinator dashboard right now.')
        }

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

  const departmentName = user?.coordinator?.department || 'Department'
  const pendingTickets = tickets.filter((ticket) => ticket.status === 'PENDING')
  const unpublishedMarks = marksReview.marks.filter((mark) => !mark.isPublished)
  const recentNotices = [...notices].slice(0, 4)
  const now = new Date()
  const sortedAssignments = [...assignments].sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
  const recentAssignments = sortedAssignments.slice(0, 5)
  const upcomingAssignments = assignments.filter((assignment) => {
    const dueDate = new Date(assignment.dueDate)
    return dueDate >= now && dueDate <= new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
  })
  const overdueAssignments = assignments.filter((assignment) => new Date(assignment.dueDate) < now)

  const selectedAttendanceReport = attendanceReports[0] || null
  const monthlyAverage = selectedAttendanceReport?.monthlyAverage || 0
  const attendanceSummary = selectedAttendanceReport?.summary || { present: 0, absent: 0, late: 0 }

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

  const semesterSnapshot = semesterSubjectMap.find((entry) => String(entry.semester) === selectedSemester) || null

  const quickLinks = [
    {
      title: 'Manage People',
      description: 'Create instructors, review students, and manage department access.',
      to: '/coordinator/users',
      icon: Users,
      accent: 'from-sky-500 to-cyan-600'
    },
    {
      title: 'Build Routine',
      description: 'Create a cleaner timetable for your department and sections.',
      to: '/coordinator/routine',
      icon: CalendarDays,
      accent: 'from-emerald-500 to-green-600'
    },
    {
      title: 'Track Attendance',
      description: 'Monitor monthly attendance and respond before problems compound.',
      to: '/coordinator/attendance',
      icon: Percent,
      accent: 'from-amber-500 to-orange-600'
    },
    {
      title: 'Publish Results',
      description: 'Clear unpublished marks and keep students updated on time.',
      to: '/coordinator/marks',
      icon: FileText,
      accent: 'from-violet-500 to-fuchsia-600'
    }
  ]

  const commandMetrics = [
    {
      label: 'Subjects',
      value: subjects.length,
      detail: `${availableSemesters.length || 0} semesters active`
    },
    {
      label: 'Students In Scope',
      value: selectedAttendanceReport?.totalStudents || 0,
      detail: selectedSemester ? `Semester ${selectedSemester}` : 'Select a semester'
    },
    {
      label: 'Pending Reviews',
      value: pendingTickets.length + unpublishedMarks.length,
      detail: `${pendingTickets.length} tickets • ${unpublishedMarks.length} marks`
    }
  ]

  const urgencyBoard = [
    {
      title: 'Assignment pressure',
      value: upcomingAssignments.length,
      description: `${overdueAssignments.length} overdue items need follow-up`,
      tone: 'border-amber-200/70 bg-amber-50/80 text-[var(--color-text)] dark:border-amber-400/25 dark:bg-amber-500/10'
    },
    {
      title: 'Unpublished marks',
      value: unpublishedMarks.length,
      description: `${marksReview.stats.published || 0} results are already visible`,
      tone: 'border-violet-200/70 bg-violet-50/80 text-[var(--color-text)] dark:border-violet-400/25 dark:bg-violet-500/10'
    },
    {
      title: 'Pending absence requests',
      value: pendingTickets.length,
      description: `${tickets.length} total department tickets`,
      tone: 'border-rose-200/70 bg-rose-50/80 text-[var(--color-text)] dark:border-rose-400/25 dark:bg-rose-500/10'
    }
  ]

  if (loading) {
    return (
      <CoordinatorLayout>
        <div className="p-4 md:p-8">
          <LoadingSkeleton rows={6} itemClassName="h-32" />
        </div>
      </CoordinatorLayout>
    )
  }

  return (
    <CoordinatorLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Coordinator Dashboard"
          subtitle="Run the department like an academic command center, with routine, attendance, people, and publishing in one place."
          breadcrumbs={['Coordinator', 'Dashboard']}
        />

        {error ? (
          <div className="mb-6 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-600">{error}</div>
        ) : null}

        <section className="mb-8 overflow-hidden rounded-[2rem] border border-[var(--color-card-border)] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,var(--color-bg-card)_0%,var(--color-surface-muted)_46%,var(--color-surface-subtle)_100%)] p-6 shadow-sm dark:shadow-slate-900/50 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200/60 bg-[color-mix(in_srgb,var(--color-bg-card)_84%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-400/20 dark:text-sky-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{departmentName} operations</span>
              </div>
              <h2 className="max-w-3xl text-3xl font-black tracking-tight text-[var(--color-text)] md:text-4xl">
                Keep the department aligned, on schedule, and ready to publish.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)] md:text-base">
                This view surfaces what needs attention first: student-facing delays, attendance drift, routine setup, and academic delivery across the current semester mix.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {commandMetrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-[var(--color-card-border)] bg-[color-mix(in_srgb,var(--color-bg-card)_88%,transparent)] px-4 py-4 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{metric.label}</p>
                    <p className="mt-3 text-3xl font-black text-[var(--color-text)]">{metric.value}</p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">{metric.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[var(--color-card-border)] bg-slate-950 p-5 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.65)] md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Current month pulse</p>
                  <p className="mt-2 text-2xl font-black">{currentMonth()}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Semester</label>
                  <select
                    value={selectedSemester}
                    onChange={(event) => setSelectedSemester(event.target.value)}
                    className="bg-transparent text-sm font-medium text-white outline-none"
                  >
                    {availableSemesters.length === 0 ? (
                      <option value="">No semesters</option>
                    ) : (
                      availableSemesters.map((semester) => (
                        <option key={semester} value={semester} className="text-[var(--color-text)]">
                          Semester {semester}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Attendance health</p>
                    <p className="mt-2 text-4xl font-black">{attendanceLoading ? '--' : `${monthlyAverage}%`}</p>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.18em] text-slate-400">
                    <p>{selectedAttendanceReport?.totalStudents || 0} students</p>
                    <p className="mt-1">{selectedSemester ? `Sem ${selectedSemester}` : 'No selection'}</p>
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${monthlyAverage >= 80 ? 'bg-emerald-400' : monthlyAverage >= 65 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${Math.min(monthlyAverage, 100)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-slate-400">Present</p>
                    <p className="mt-1 text-lg font-bold text-white">{attendanceSummary.present}</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-slate-400">Absent</p>
                    <p className="mt-1 text-lg font-bold text-white">{attendanceSummary.absent}</p>
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] px-3 py-3">
                    <p className="text-slate-400">Late</p>
                    <p className="mt-1 text-lg font-bold text-white">{attendanceSummary.late}</p>
                  </div>
                </div>
                <Link to="/coordinator/attendance" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-300 hover:text-sky-200">
                  <span>Open attendance desk</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.title}
                to={item.to}
                className="group overflow-hidden rounded-[1.6rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:shadow-slate-900/50"
              >
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${item.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-heading)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{item.description}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-role-accent)]">
                  <span>Open</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            )
          })}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_380px]">
          <section className="space-y-6">
            <div className={panelClassName}>
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Academic radar</p>
                  <h2 className="mt-2 text-xl font-black text-[var(--color-heading)]">Semester delivery snapshot</h2>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">See where the selected semester stands across subjects, assignments, and unpublished results.</p>
                </div>
                <Link to="/coordinator/subjects" className="text-sm font-semibold text-[var(--color-role-accent)] hover:underline">
                  Open subjects
                </Link>
              </div>

              {attendanceLoading && !selectedAttendanceReport ? (
                <LoadingSkeleton rows={1} itemClassName="h-36" />
              ) : !semesterSnapshot ? (
                <EmptyState
                  icon="🧭"
                  title="No semester activity yet"
                  description="Once the department has subjects configured, this semester snapshot will become more useful."
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-5">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Semester {semesterSnapshot.semester}</p>
                    <p className="mt-2 text-4xl font-black text-[var(--color-heading)]">{semesterSnapshot.subjectCount}</p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">Active modules currently configured in the selected semester.</p>
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                        <span className="text-sm text-[var(--color-text-muted)]">Assignments</span>
                        <span className="font-semibold text-[var(--color-heading)]">{semesterSnapshot.assignmentCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                        <span className="text-sm text-[var(--color-text-muted)]">Pending publish</span>
                        <span className="font-semibold text-[var(--color-heading)]">{semesterSnapshot.unpublishedCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                        <span className="text-sm text-[var(--color-text-muted)]">Attendance average</span>
                        <span className="font-semibold text-[var(--color-heading)]">{monthlyAverage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {urgencyBoard.map((item) => (
                      <div key={item.title} className={`rounded-[1.5rem] border px-4 py-4 ${item.tone}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{item.title}</p>
                        <p className="mt-3 text-3xl font-black">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 opacity-80">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={panelClassName}>
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Action lanes</p>
                  <h2 className="mt-2 text-xl font-black text-[var(--color-heading)]">Department review queues</h2>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">The most useful coordinator work happens here: requests, marks waiting to publish, and assignment deadlines.</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Requests</p>
                        <p className="text-xs text-[var(--color-text-soft)]">{pendingTickets.length} pending</p>
                      </div>
                    </div>
                    <Link to="/coordinator/requests" className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-role-accent)]">
                      Review
                    </Link>
                  </div>
                  {pendingTickets.length === 0 ? (
                    <EmptyState icon="📬" title="Queue clear" description="No absence requests are waiting for review." />
                  ) : (
                    <div className="space-y-3">
                      {pendingTickets.slice(0, 4).map((ticket) => (
                        <div key={ticket.id} className="rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                          <p className="text-sm font-semibold text-[var(--color-heading)]">{ticket.student?.user?.name || 'Student'}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-soft)]">{ticket.attendance?.subject?.code || 'Subject pending'} • {formatDate(ticket.createdAt)}</p>
                          <p className="mt-2 line-clamp-2 text-sm text-[var(--color-text-muted)]">{ticket.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Results</p>
                        <p className="text-xs text-[var(--color-text-soft)]">{unpublishedMarks.length} awaiting publish</p>
                      </div>
                    </div>
                    <Link to="/coordinator/marks" className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-role-accent)]">
                      Publish
                    </Link>
                  </div>
                  {unpublishedMarks.length === 0 ? (
                    <EmptyState icon="📝" title="All clear" description="No unpublished marks are waiting right now." />
                  ) : (
                    <div className="space-y-3">
                      {unpublishedMarks.slice(0, 4).map((mark) => (
                        <div key={mark.id} className="rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                          <p className="text-sm font-semibold text-[var(--color-heading)]">{mark.student?.user?.name || 'Student'}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-soft)]">{mark.subject?.code} • {mark.examType}</p>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{mark.obtainedMarks}/{mark.totalMarks} marks recorded</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                        <TimerReset className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Deadlines</p>
                        <p className="text-xs text-[var(--color-text-soft)]">{upcomingAssignments.length} due this week</p>
                      </div>
                    </div>
                    <Link to="/coordinator/assignments" className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-role-accent)]">
                      Open
                    </Link>
                  </div>
                  {recentAssignments.length === 0 ? (
                    <EmptyState icon="🗂️" title="No assignments yet" description="Assignment deadlines will appear here once coursework is posted." />
                  ) : (
                    <div className="space-y-3">
                      {recentAssignments.slice(0, 4).map((assignment) => {
                        const tone = getAssignmentTone(assignment.dueDate, now)
                        return (
                          <div key={assignment.id} className="rounded-2xl bg-[var(--color-card-surface)] px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[var(--color-heading)]">{assignment.title}</p>
                                <p className="mt-1 text-xs text-[var(--color-text-soft)]">{assignment.subject?.code || 'Subject'} • {formatDateTime(assignment.dueDate)}</p>
                              </div>
                              <span className={tone.badge}>{tone.label}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className={panelClassName}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Operational mix</p>
                  <h2 className="mt-2 text-xl font-black text-[var(--color-heading)]">What is moving right now</h2>
                </div>
                <BellRing className="h-5 w-5 text-[var(--color-role-accent)]" />
              </div>

              <div className="space-y-3">
                <div className="rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                        <BookOpenText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Subject coverage</p>
                        <p className="text-xs text-[var(--color-text-soft)]">Department teaching structure</p>
                      </div>
                    </div>
                    <span className="text-lg font-black text-[var(--color-heading)]">{subjects.length}</span>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                        <Percent className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Attendance average</p>
                        <p className="text-xs text-[var(--color-text-soft)]">Current semester monthly view</p>
                      </div>
                    </div>
                    <span className="text-lg font-black text-[var(--color-heading)]">{monthlyAverage}%</span>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-fuchsia-100 p-3 text-fuchsia-700">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-heading)]">Published results</p>
                        <p className="text-xs text-[var(--color-text-soft)]">Coordinator review throughput</p>
                      </div>
                    </div>
                    <span className="text-lg font-black text-[var(--color-heading)]">{marksReview.stats.published || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={panelClassName}>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Notice timeline</p>
                  <h2 className="mt-2 text-xl font-black text-[var(--color-heading)]">Recent notices</h2>
                </div>
                <Link to="/coordinator/notices" className="text-sm font-semibold text-[var(--color-role-accent)] hover:underline">
                  Manage
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
                    <div key={notice.id} className="rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="ui-status-badge ui-status-neutral">{notice.type}</span>
                        <span className="text-xs text-[var(--color-text-soft)]">{formatDate(notice.createdAt, { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--color-heading)]">{notice.title}</p>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-muted)]">{notice.content}</p>
                    </div>
                  ))}
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
