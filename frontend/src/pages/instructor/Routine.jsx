import { useState, useEffect } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SHORT = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' }

const COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-teal-100 border-teal-300 text-teal-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
]

const todayName = () => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  return days[new Date().getDay()]
}

const InstructorRoutine = () => {
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(todayName())

  useEffect(() => { fetchRoutines() }, [])

  const fetchRoutines = async () => {
    try {
      const res = await api.get('/routines')
      setRoutines(res.data.routines)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = routines.filter(r => r.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
    return acc
  }, {})

  const subjectColorMap = {}
  routines.forEach((r) => {
    if (!subjectColorMap[r.subjectId]) {
      subjectColorMap[r.subjectId] = COLORS[Object.keys(subjectColorMap).length % COLORS.length]
    }
  })

  const todayClasses = byDay[activeDay] || []

  return (
    <InstructorLayout>
      <div className="p-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Class Routine</h1>
          <p className="text-gray-500 text-sm mt-1">Your weekly timetable</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <>
            {/* Today's highlight */}
            {byDay[todayName()].length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6">
                <h2 className="font-semibold text-green-800 mb-3">📅 Today's Classes ({DAY_SHORT[todayName()]})</h2>
                <div className="space-y-2">
                  {byDay[todayName()].map(r => (
                    <div key={r.id} className="flex items-center gap-4 bg-white rounded-xl p-3 shadow-sm">
                      <div className="text-center min-w-[60px]">
                        <p className="text-sm font-bold text-green-600">{r.startTime}</p>
                        <p className="text-xs text-gray-400">{r.endTime}</p>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{r.subject?.name}</p>
                        <p className="text-xs text-gray-500">{r.subject?.code}</p>
                      </div>
                      {r.room && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                          🚪 {r.room}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Day tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
                    ${activeDay === day
                      ? 'bg-green-600 text-white'
                      : day === todayName()
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-white text-gray-600 border hover:bg-gray-50'
                    }`}
                >
                  {DAY_SHORT[day]}
                  {byDay[day].length > 0 && (
                    <span className="ml-1 text-xs opacity-70">
                      {byDay[day].length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Classes for selected day */}
            <div className="space-y-3">
              {todayClasses.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-2xl shadow-sm">
                  No classes on {DAY_SHORT[activeDay]}
                </div>
              ) : (
                todayClasses.map(r => (
                  <div key={r.id} className={`border-l-4 rounded-2xl p-5 shadow-sm flex gap-5 items-center ${subjectColorMap[r.subjectId]}`}>
                    <div className="text-center min-w-[70px]">
                      <p className="text-lg font-bold">{r.startTime}</p>
                      <p className="text-xs opacity-70">to {r.endTime}</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{r.subject?.name}</h3>
                      <p className="text-sm text-gray-500">{r.subject?.code}</p>
                    </div>
                    {r.room && (
                      <div className="text-right">
                        <span className="text-sm font-medium">🚪 {r.room}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Full week compact view */}
            <div className="mt-8 bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-800">Full Week Overview</h2>
              </div>
              <div className="divide-y">
                {DAYS.filter(d => byDay[d].length > 0).map(day => (
                  <div key={day} className="p-4">
                    <p className={`text-sm font-bold mb-2 ${day === todayName() ? 'text-green-600' : 'text-gray-700'}`}>
                      {day === todayName() ? '📍 ' : ''}{DAY_SHORT[day]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {byDay[day].map(r => (
                        <span key={r.id} className={`text-xs px-3 py-1 rounded-full border ${subjectColorMap[r.subjectId]}`}>
                          {r.subject?.code} · {r.startTime}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {DAYS.filter(d => byDay[d].length > 0).length === 0 && (
                  <div className="p-8 text-center text-gray-400">No routines set yet</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </InstructorLayout>
  )
}

export default InstructorRoutine