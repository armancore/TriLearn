import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ClipboardCheck, Clock3, Layers, MapPin, UserRound } from 'lucide-react'
import Alert from './Alert'
import EmptyState from './EmptyState'
import LoadingSkeleton from './LoadingSkeleton'
import PageHeader from './PageHeader'

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const DAY_SHORT = { SUNDAY: 'Sun', MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat' }

const ROUTINE_TONES = [
  'routine-tone-1',
  'routine-tone-2',
  'routine-tone-3',
  'routine-tone-4',
  'routine-tone-5',
  'routine-tone-6',
  'routine-tone-7'
]

const todayName = () => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  return days[new Date().getDay()]
}

const getTodayDateValue = () => new Date().toISOString().slice(0, 10)
const timeRange = (start, end) => `${start} - ${end}`
const CLASS_TYPE_LABELS = { LECTURE: 'Lecture', TUTORIAL: 'Tutorial', WORKSHOP: 'Workshop' }
const formatClassType = (value) => CLASS_TYPE_LABELS[value] || 'Lecture'

const getRoutineScope = (routine) => ({
  department: routine.department || routine.subject?.department || 'General',
  semester: routine.semester ? `Semester ${routine.semester}` : 'Semester not set',
  section: routine.section ? `Section ${routine.section}` : 'All sections'
})

const getAttendanceLink = (attendancePath, routine) => {
  if (!attendancePath || !routine.subjectId) {
    return ''
  }

  const params = new URLSearchParams({
    subject: routine.subjectId,
    semester: String(routine.semester || ''),
    section: String(routine.section || ''),
    date: getTodayDateValue()
  })

  return `${attendancePath}?${params.toString()}`
}

const RoutineView = ({
  Layout,
  title = 'Class Routine',
  subtitle = 'Your weekly timetable',
  breadcrumbs,
  loading,
  error,
  routines,
  attendancePath = ''
}) => {
  const [activeDay, setActiveDay] = useState(todayName())
  const today = todayName()

  const byDay = useMemo(() => DAYS.reduce((accumulator, day) => {
    accumulator[day] = routines
      .filter((routine) => routine.dayOfWeek === day)
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
    return accumulator
  }, {}), [routines])

  const subjectColorMap = useMemo(() => {
    const colorMap = {}
    routines.forEach((routine) => {
      if (!colorMap[routine.subjectId]) {
        colorMap[routine.subjectId] = ROUTINE_TONES[Object.keys(colorMap).length % ROUTINE_TONES.length]
      }
    })
    return colorMap
  }, [routines])

  const sortedRoutines = useMemo(() => (
    [...routines].sort((left, right) => {
      const dayDiff = DAYS.indexOf(left.dayOfWeek) - DAYS.indexOf(right.dayOfWeek)
      return dayDiff !== 0 ? dayDiff : left.startTime.localeCompare(right.startTime)
    })
  ), [routines])

  const activeRoutines = byDay[activeDay] || []
  const todayRoutines = byDay[today] || []
  const totalHours = useMemo(() => routines.reduce((sum, routine) => {
    const [startHour, startMinute] = String(routine.startTime || '0:0').split(':').map(Number)
    const [endHour, endMinute] = String(routine.endTime || '0:0').split(':').map(Number)
    const minutes = ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute)
    return sum + Math.max(minutes, 0)
  }, 0), [routines])

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumbs={breadcrumbs}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : routines.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No routine available yet"
            description="Your weekly timetable will appear here once the academic team adds your classes."
          />
        ) : (
          <>
            <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/40">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="p-5 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Weekly Schedule</p>
                      <h2 className="mt-2 text-2xl font-bold text-[var(--color-heading)]">Classes by day, time, and room</h2>
                      <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
                        Open a day to scan its classes. Instructor routine cards can open the matching attendance workspace directly.
                      </p>
                    </div>
                    <span className="ui-status-badge ui-status-info">{routines.length} classes</span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-heading)]">
                        <CalendarDays className="h-4 w-4" />
                        <span>Today</span>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-heading)]">{todayRoutines.length}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">scheduled classes</p>
                    </div>
                    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-heading)]">
                        <Layers className="h-4 w-4" />
                        <span>Subjects</span>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-heading)]">{Object.keys(subjectColorMap).length}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">active modules</p>
                    </div>
                    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-heading)]">
                        <Clock3 className="h-4 w-4" />
                        <span>Weekly Load</span>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-[var(--color-heading)]">{Math.round(totalHours / 60)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">class hours</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-5 lg:border-l lg:border-t-0">
                  <p className="text-sm font-semibold text-[var(--color-heading)]">Next up</p>
                  <div className="mt-4 space-y-3">
                    {sortedRoutines.slice(0, 3).map((routine) => {
                      const scope = getRoutineScope(routine)
                      return (
                        <div key={routine.id} className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-role-accent)]">{DAY_SHORT[routine.dayOfWeek]} {timeRange(routine.startTime, routine.endTime)}</p>
                          <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{routine.subject?.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{scope.department} • {scope.semester} • {scope.section}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>

            <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`min-w-[92px] whitespace-nowrap rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-role-accent)] focus-visible:ring-offset-2 ${
                    activeDay === day
                      ? 'border-[var(--color-role-accent)] bg-[var(--color-role-accent)] text-white shadow-sm'
                      : 'border-[var(--color-card-border)] bg-[--color-bg-card] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
                  }`}
                >
                  <span className="block">{DAY_SHORT[day]}</span>
                  <span className={`mt-1 block text-xs ${activeDay === day ? 'text-white/80' : 'text-[var(--color-text-soft)]'}`}>
                    {byDay[day].length} classes
                  </span>
                </button>
              ))}
            </div>

            <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">Selected Day</p>
                    <h2 className="mt-1 text-xl font-bold text-[var(--color-heading)]">{DAY_SHORT[activeDay]}</h2>
                  </div>
                  {activeDay === today ? <span className="ui-status-badge">Today</span> : null}
                </div>
                <div className="mt-5 space-y-3">
                  {activeRoutines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--color-card-border)] px-3 py-8 text-center text-sm text-[var(--color-text-soft)]">
                      No classes scheduled.
                    </div>
                  ) : activeRoutines.map((routine) => (
                    <button
                      key={routine.id}
                      type="button"
                      onClick={() => setActiveDay(routine.dayOfWeek)}
                      className="w-full rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3 text-left transition hover:border-[var(--color-role-accent)]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-role-accent)]">{timeRange(routine.startTime, routine.endTime)}</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{routine.subject?.code || routine.subject?.name}</p>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="space-y-4">
                {activeRoutines.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-5 py-12 text-center">
                    <p className="font-semibold text-[var(--color-heading)]">No routine entries for {DAY_SHORT[activeDay]}.</p>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">Choose another day to view scheduled classes.</p>
                  </div>
                ) : activeRoutines.map((routine) => {
                  const attendanceLink = getAttendanceLink(attendancePath, routine)
                  const scope = getRoutineScope(routine)
                  const content = (
                    <>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-[var(--color-card-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                              {formatClassType(routine.classType)}
                            </span>
                            <span className="rounded-lg bg-[var(--color-card-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                              {routine.subject?.code || 'No code'}
                            </span>
                          </div>
                          <h3 className="mt-4 text-xl font-bold text-[var(--color-heading)]">{routine.subject?.name || 'Untitled subject'}</h3>
                          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{scope.department} • {scope.semester} • {scope.section}</p>
                        </div>

                        <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-heading)]">
                          <div className="flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-[var(--color-role-accent)]" />
                            <span>{timeRange(routine.startTime, routine.endTime)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-xl bg-[var(--color-card-surface)] px-4 py-3">
                          <UserRound className="h-4 w-4 text-[var(--color-role-accent)]" />
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--color-text-soft)]">Instructor</p>
                            <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{routine.instructor?.user?.name || 'Not assigned'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl bg-[var(--color-card-surface)] px-4 py-3">
                          <MapPin className="h-4 w-4 text-[var(--color-role-accent)]" />
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--color-text-soft)]">Room</p>
                            <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{routine.room || 'Not assigned'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl bg-[var(--color-card-surface)] px-4 py-3">
                          <ClipboardCheck className="h-4 w-4 text-[var(--color-role-accent)]" />
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--color-text-soft)]">{attendanceLink ? 'Action' : 'Status'}</p>
                            <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{attendanceLink ? 'Open attendance' : 'Routine only'}</p>
                          </div>
                        </div>
                      </div>

                      {routine.note ? (
                        <p className="mt-4 rounded-xl bg-[var(--color-card-surface)] px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">{routine.note}</p>
                      ) : null}

                      {attendanceLink ? (
                        <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[var(--color-role-accent)]">
                          <span>Edit attendance for this class</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      ) : null}
                    </>
                  )

                  const className = `block rounded-[1.5rem] border p-5 transition ${subjectColorMap[routine.subjectId]} ${attendanceLink ? 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-role-accent)] focus-visible:ring-offset-2' : ''}`

                  return attendanceLink ? (
                    <Link key={routine.id} to={attendanceLink} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <article key={routine.id} className={className}>
                      {content}
                    </article>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  )
}

export default RoutineView
