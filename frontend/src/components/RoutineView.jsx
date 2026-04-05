import { useMemo, useState } from 'react'
import Alert from './Alert'
import EmptyState from './EmptyState'
import LoadingSkeleton from './LoadingSkeleton'
import PageHeader from './PageHeader'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' }

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

const timeRange = (start, end) => `${start} - ${end}`

const RoutineView = ({
  Layout,
  title = 'Class Routine',
  subtitle = 'Your weekly timetable',
  breadcrumbs,
  loading,
  error,
  routines
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
            icon="🗓️"
            title="No routine available yet"
            description="Your weekly timetable will appear here once the academic team adds your classes."
          />
        ) : (
          <>
            <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-role-accent)] focus-visible:ring-offset-2 ${
                    activeDay === day
                      ? 'border-[var(--color-role-accent)] bg-[var(--color-role-accent)] text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {DAY_SHORT[day]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-7">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    day === today ? 'border-[var(--color-role-accent)]/30 bg-[var(--color-role-soft)]' : 'border-slate-200 bg-white'
                  } ${activeDay === day ? 'ring-2 ring-[var(--color-role-accent)]/20' : ''}`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-bold ${day === today ? 'text-[var(--color-role-accent)]' : 'text-slate-700'}`}>{DAY_SHORT[day]}</p>
                      <p className="text-xs text-slate-400">{byDay[day].length} classes</p>
                    </div>
                    {day === today ? <span className="ui-status-badge">Today</span> : null}
                  </div>

                  <div className="space-y-3">
                    {byDay[day].length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                        No classes
                      </div>
                    ) : (
                      byDay[day].map((routine) => (
                        <div key={routine.id} className={`rounded-2xl border p-4 ${subjectColorMap[routine.subjectId]}`}>
                          <span className="mb-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                            {timeRange(routine.startTime, routine.endTime)}
                          </span>
                          <h3 className="font-semibold text-slate-900">{routine.subject?.name}</h3>
                          <p className="mt-1 text-sm text-slate-600">{routine.subject?.code}</p>
                          <p className="mt-2 text-xs text-slate-600">
                            {routine.department || routine.subject?.department || 'General'} • Semester {routine.semester}{routine.section ? ` • Section ${routine.section}` : ''}
                          </p>
                          <p className="mt-2 text-xs text-slate-600">Instructor: {routine.instructor?.user?.name}</p>
                          {routine.room ? <p className="mt-1 text-xs text-slate-600">Room: {routine.room}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

export default RoutineView
