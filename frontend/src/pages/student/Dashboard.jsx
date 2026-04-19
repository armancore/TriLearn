import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BellRing, BookOpenText, CalendarDays, ClipboardList, Percent } from 'lucide-react'
import { Link } from 'react-router-dom'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import logger from '../../utils/logger'

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const getTodayName = () => DAYS[new Date().getDay()]

const formatDate = (value, options) => new Date(value).toLocaleDateString('en-US', options)

const StudentDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState([])
  const [assignments, setAssignments] = useState([])
  const [notices, setNotices] = useState([])
  const [routines, setRoutines] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const loadDashboard = async () => {
      try {
        setLoading(true)
        setError('')
        const [subjectsRes, attendanceRes, assignmentsRes, noticesRes, routineRes] = await Promise.all([
          api.get('/subjects', { signal: controller.signal }),
          api.get('/attendance/my', { signal: controller.signal }),
          api.get('/assignments', { signal: controller.signal }),
          api.get('/notices', { params: { page: 1, limit: 5 }, signal: controller.signal }),
          api.get('/routines', { signal: controller.signal })
        ])

        if (controller.signal.aborted) {
          return
        }

        setSubjects(subjectsRes.data.subjects || [])
        setAttendanceSummary(attendanceRes.data.summary || [])
        setAssignments(assignmentsRes.data.assignments || [])
        setNotices(noticesRes.data.notices || [])
        setRoutines(routineRes.data.routines || [])
      } catch (requestError) {
        if (requestError?.code === 'ERR_CANCELED' || requestError?.response?.status === 401) {
          return
        }

        logger.error('Failed to load student dashboard', requestError)
        setError('Unable to load your dashboard right now.')
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

  const attendanceByCode = useMemo(() => new Map(
    attendanceSummary.map((item) => [
      item.code,
      {
        ...item,
        percentageValue: Number.parseFloat(String(item.percentage).replace('%', '')) || 0
      }
    ])
  ), [attendanceSummary])

  const overallAttendanceTotals = attendanceSummary.reduce((totals, item) => ({
    attended: totals.attended + (item.present ?? 0) + (item.late ?? 0),
    total: totals.total + (item.total ?? 0)
  }), { attended: 0, total: 0 })

  const overallAttendance = overallAttendanceTotals.total > 0
    ? Math.round((overallAttendanceTotals.attended / overallAttendanceTotals.total) * 100)
    : 0

  const upcomingAssignments = [...assignments]
    .filter((assignment) => new Date(assignment.dueDate) >= new Date())
    .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
    .slice(0, 4)

  const recentNotices = [...notices]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 4)

  const todayRoutine = [...routines]
    .filter((routine) => routine.dayOfWeek === getTodayName())
    .sort((left, right) => left.startTime.localeCompare(right.startTime))

  const attendanceHighlights = subjects
    .map((subject) => {
      const attendance = attendanceByCode.get(subject.code)
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        semester: subject.semester,
        department: subject.department,
        percentage: attendance?.percentageValue ?? 0,
        present: attendance?.present ?? 0,
        total: attendance?.total ?? 0
      }
    })
    .sort((left, right) => right.percentage - left.percentage)
    .slice(0, 4)

  const stats = [
    { title: 'Attendance', value: `${overallAttendance}%`, icon: Percent, iconClassName: 'from-emerald-500 to-green-600', trend: `${attendanceSummary.length} subjects`, trendLabel: 'tracked so far' },
    { title: 'Today\'s Classes', value: todayRoutine.length, icon: CalendarDays, iconClassName: 'from-blue-500 to-cyan-600', trend: todayRoutine[0] ? `${todayRoutine[0].startTime} starts first` : 'No classes today', trendLabel: 'routine snapshot' },
    { title: 'Upcoming Tasks', value: upcomingAssignments.length, icon: ClipboardList, iconClassName: 'from-amber-500 to-orange-600', trend: `${assignments.length} total`, trendLabel: 'assignments visible' },
    { title: 'Recent Notices', value: recentNotices.length, icon: BellRing, iconClassName: 'from-sky-600 to-indigo-600', trend: `${notices.length} available`, trendLabel: 'campus updates' }
  ]

  if (loading) {
    return (
      <StudentLayout>
        <div className="student-page p-4 md:p-8">
          <LoadingSkeleton rows={6} itemClassName="h-28" />
        </div>
      </StudentLayout>
    )
  }

  return (
    <StudentLayout noticesCount={notices.length}>
      <div className="student-page p-4 md:p-8">
        <PageHeader
          title={`Welcome back, ${user?.name || 'Student'}`}
          subtitle="Track your attendance, check what is due next, catch up on notices, and see today’s class plan in one place."
          breadcrumbs={['Student', 'Dashboard']}
        />

        <Alert type="error" message={error} />

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
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

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="space-y-6">
            <div className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Today&apos;s Routine</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {getTodayName().charAt(0) + getTodayName().slice(1).toLowerCase()} schedule for your enrolled classes.
                  </p>
                </div>
                <Link to="/student/routine" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Full routine
                </Link>
              </div>

              {todayRoutine.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No classes today"
                  description="Your weekly timetable is clear for today."
                />
              ) : (
                <div className="space-y-3">
                  {todayRoutine.map((routine) => (
                    <div key={routine.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{routine.subject?.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{routine.subject?.code}</p>
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            {routine.department || routine.subject?.department || 'General'} • Semester {routine.semester}{routine.section ? ` • Section ${routine.section}` : ''}
                          </p>
                        </div>
                        <div className="text-sm text-[var(--color-text-muted)]">
                          <p className="font-medium">{routine.startTime} - {routine.endTime}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{routine.room ? `Room ${routine.room}` : 'Room not assigned'}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{routine.instructor?.user?.name || 'Instructor not assigned'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Upcoming Assignments</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">The next deadlines from your current modules.</p>
                </div>
                <Link to="/student/assignments" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  All assignments
                </Link>
              </div>

              {upcomingAssignments.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nothing due soon"
                  description="New assignments will show up here when instructors publish them."
                />
              ) : (
                <div className="space-y-3">
                  {upcomingAssignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{assignment.title}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{assignment.subject?.name} ({assignment.subject?.code})</p>
                        </div>
                        <div className="text-sm text-[var(--color-text-muted)]">
                          <p className="font-medium">{formatDate(assignment.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{assignment.totalMarks} marks</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Enrolled Subjects</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Open any subject to view assignments, study materials, and what is coming next.</p>
                </div>
                <Link to="/student/subjects" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  All subjects
                </Link>
              </div>

              {subjects.length === 0 ? (
                <EmptyState
                  icon={BookOpenText}
                  title="No enrolled subjects yet"
                  description="Your subjects will appear here once your enrollment is active."
                />
              ) : (
                <div className="space-y-3">
                  {subjects.slice(0, 4).map((subject) => (
                    <div key={subject.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--color-text)]">{subject.name}</p>
                            <span className="rounded-full bg-[var(--color-surface-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                              {subject.code}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            {subject.department || user?.student?.department || 'General'} • Semester {subject.semester}
                          </p>
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            {subject._count?.assignments ?? 0} assignments • {subject._count?.materials ?? 0} study materials
                          </p>
                        </div>
                        <Link
                          to={`/student/subjects/${subject.id}/learnings`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-role-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          Learnings
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Attendance Snapshot</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Your strongest and weakest attendance trends by subject.</p>
                </div>
                <Link to="/student/attendance" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  Full attendance
                </Link>
              </div>

              {attendanceHighlights.length === 0 ? (
                <EmptyState
                  icon={Percent}
                  title="No attendance yet"
                  description="Your subject-wise attendance summary will appear after your first recorded classes."
                />
              ) : (
                <div className="space-y-3">
                  {attendanceHighlights.map((subject) => (
                    <div key={subject.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{subject.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{subject.code}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${subject.percentage >= 80 ? 'bg-primary-100 text-primary' : 'bg-accent-100 text-accent-700'}`}>
                          {subject.percentage.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                        <div className={`h-full rounded-full ${subject.percentage >= 80 ? 'bg-primary-500' : 'bg-accent'}`} style={{ width: `${Math.min(subject.percentage, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">{subject.present} present out of {subject.total} records</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">Recent Notices</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">The latest updates posted for students.</p>
                </div>
                <Link to="/student/notices" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                  All notices
                </Link>
              </div>

              {recentNotices.length === 0 ? (
                <EmptyState
                  icon={BellRing}
                  title="No notices yet"
                  description="Recent announcements will appear here when they are published."
                />
              ) : (
                <div className="space-y-3">
                  {recentNotices.map((notice) => (
                    <div key={notice.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-[var(--color-surface-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                          {notice.type}
                        </span>
                        <span className="text-xs text-[var(--color-text-soft)]">
                          {formatDate(notice.createdAt, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">{notice.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--color-text-muted)]">{notice.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-5 py-5 shadow-sm dark:shadow-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-role-accent)]/10 text-[var(--color-role-accent)]">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{subjects.length} enrolled subjects</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {user?.student?.department || 'Department pending'}{user?.student?.semester ? ` • Semester ${user.student.semester}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </StudentLayout>
  )
}

export default StudentDashboard
