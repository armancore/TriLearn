import { useState, useEffect } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
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

const AdminRoutine = () => {
  const [routines, setRoutines] = useState([])
  const [subjects, setSubjects] = useState([])
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editRoutine, setEditRoutine] = useState(null)
  const [form, setForm] = useState({
    subjectId: '', instructorId: '', dayOfWeek: 'MONDAY',
    startTime: '08:00', endTime: '09:00', room: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchRoutines()
    fetchSubjects()
    fetchInstructors()
  }, [])

  const fetchRoutines = async () => {
    try {
      setLoading(true)
      const res = await api.get('/routines')
      setRoutines(res.data.routines)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (err) { console.error(err) }
  }

  const fetchInstructors = async () => {
    try {
      const res = await api.get('/admin/users?role=INSTRUCTOR')
      setInstructors(res.data.users)
    } catch (err) { console.error(err) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editRoutine) {
        await api.put(`/routines/${editRoutine.id}`, form)
        setSuccess('Routine updated!')
      } else {
        await api.post('/routines', form)
        setSuccess('Routine created!')
      }
      setShowModal(false)
      setEditRoutine(null)
      setForm({ subjectId: '', instructorId: '', dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '09:00', room: '' })
      fetchRoutines()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this routine entry?')) return
    try {
      await api.delete(`/routines/${id}`)
      setSuccess('Deleted!')
      fetchRoutines()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const openEdit = (r) => {
    setEditRoutine(r)
    setForm({
      subjectId: r.subjectId,
      instructorId: r.instructorId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room || ''
    })
    setError('')
    setShowModal(true)
  }

  // Group routines by day
  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = routines.filter(r => r.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
    return acc
  }, {})

  // Assign color per subject
  const subjectColorMap = {}
  routines.forEach((r, i) => {
    if (!subjectColorMap[r.subjectId]) {
      subjectColorMap[r.subjectId] = COLORS[Object.keys(subjectColorMap).length % COLORS.length]
    }
  })

  return (
    <AdminLayout>
      <div className="p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Class Routine</h1>
            <p className="text-gray-500 text-sm mt-1">Manage weekly timetable</p>
          </div>
          <button
            onClick={() => { setEditRoutine(null); setForm({ subjectId: '', instructorId: '', dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '09:00', room: '' }); setError(''); setShowModal(true) }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            + Add Class
          </button>
        </div>

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <>
            {/* Weekly Grid */}
            <div className="grid grid-cols-7 gap-3 mb-8">
              {DAYS.map(day => (
                <div key={day} className="min-h-[200px]">
                  {/* Day header */}
                  <div className="bg-blue-600 text-white text-center py-2 rounded-t-xl text-sm font-semibold mb-2">
                    {DAY_SHORT[day]}
                  </div>
                  {/* Classes */}
                  <div className="space-y-2">
                    {byDay[day].map(r => (
                      <div
                        key={r.id}
                        className={`border rounded-xl p-2 cursor-pointer hover:shadow-md transition ${subjectColorMap[r.subjectId]}`}
                        onClick={() => openEdit(r)}
                      >
                        <p className="text-xs font-bold truncate">{r.subject?.code}</p>
                        <p className="text-xs truncate">{r.startTime}–{r.endTime}</p>
                        {r.room && <p className="text-xs opacity-75">🚪 {r.room}</p>}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id) }}
                          className="text-xs text-red-500 hover:text-red-700 mt-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {byDay[day].length === 0 && (
                      <div className="text-center text-gray-300 text-xs py-4">—</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* List view */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-800">All Entries</h2>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm text-gray-500">
                    <th className="px-6 py-3">Day</th>
                    <th className="px-6 py-3">Subject</th>
                    <th className="px-6 py-3">Instructor</th>
                    <th className="px-6 py-3">Time</th>
                    <th className="px-6 py-3">Room</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {routines.map(r => (
                    <tr key={r.id} className="border-t hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-800">{DAY_SHORT[r.dayOfWeek]}</td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-800">{r.subject?.name}</p>
                        <p className="text-xs text-gray-400">{r.subject?.code}</p>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{r.instructor?.user?.name}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{r.startTime} – {r.endTime}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{r.room || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(r)}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(r.id)}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {routines.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No routines yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">{editRoutine ? 'Edit Class' : 'Add Class'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <select required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} — {s.code}</option>)}
              </select>
              <select required value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Instructor</option>
                {instructors.filter(i => i.instructor?.id).map(i => (
  <option key={i.instructor.id} value={i.instructor.id}>{i.name}</option>
))}
              </select>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
                  <input type="time" required value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">End Time</label>
                  <input type="time" required value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <input type="text" placeholder="Room / Location (optional)"
                value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">
                  {editRoutine ? 'Update' : 'Add Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export default AdminRoutine