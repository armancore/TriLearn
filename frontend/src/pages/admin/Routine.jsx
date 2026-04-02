import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import logger from '../../utils/logger'
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

const defaultForm = {
  subjectId: '',
  instructorId: '',
  department: '',
  semester: 1,
  section: '',
  dayOfWeek: 'MONDAY',
  startTime: '08:00',
  endTime: '09:00',
  room: ''
}

const AdminRoutine = () => {
  const [routines, setRoutines] = useState([])
  const [subjects, setSubjects] = useState([])
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editRoutine, setEditRoutine] = useState(null)
  const [routineToDelete, setRoutineToDelete] = useState(null)
  const [deletingRoutine, setDeletingRoutine] = useState(false)
  const [form, setForm] = useState(defaultForm)
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
      logger.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (err) { logger.error(err) }
  }

  const fetchInstructors = async () => {
    try {
      const res = await api.get('/admin/users?role=INSTRUCTOR')
      setInstructors(res.data.users)
    } catch (err) { logger.error(err) }
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
      setForm(defaultForm)
      fetchRoutines()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async () => {
    if (!routineToDelete) return
    try {
      setDeletingRoutine(true)
      await api.delete(`/routines/${routineToDelete.id}`)
      setRoutineToDelete(null)
      setSuccess('Deleted!')
      fetchRoutines()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setDeletingRoutine(false)
    }
  }

  const openEdit = (r) => {
    setEditRoutine(r)
    setForm({
      subjectId: r.subjectId,
      instructorId: r.instructorId,
      department: r.department || '',
      semester: r.semester,
      section: r.section || '',
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

  const normalizeValue = (value) => String(value || '').trim().toLowerCase()

  const filteredSubjects = subjects.filter((subject) => {
    const semesterMatches = Number(subject.semester) === Number(form.semester)

    if (!semesterMatches) {
      return false
    }

    if (!form.department.trim()) {
      return true
    }

    return normalizeValue(subject.department) === normalizeValue(form.department)
  })

  const handleSubjectChange = (subjectId) => {
    const subject = subjects.find((item) => item.id === subjectId)
    if (!subject) {
      setForm({ ...form, subjectId })
      return
    }

    setForm({
      ...form,
      subjectId,
      department: subject.department || '',
      semester: subject.semester
    })
  }

  return (
    <AdminLayout>
      <div className="p-8">

        <PageHeader
          title="Class Routine"
          subtitle="Manage weekly timetable"
          breadcrumbs={['Admin', 'Routine']}
          actions={[{
            label: 'Add Class',
            icon: Plus,
            variant: 'primary',
            onClick: () => { setEditRoutine(null); setForm(defaultForm); setError(''); setShowModal(true) }
          }]}
        />

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
                        <p className="mt-1 text-[11px] opacity-80">Sem {r.semester}{r.section ? ` • Sec ${r.section}` : ''}</p>
                        <p className="text-xs truncate">{r.startTime}–{r.endTime}</p>
                        {r.room && <p className="text-xs opacity-75">🚪 {r.room}</p>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setRoutineToDelete(r) }}
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
                    <th className="px-6 py-3">Academic</th>
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
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-gray-800">{r.department || 'General'}</p>
                        <p className="text-xs text-gray-400">Semester {r.semester}{r.section ? ` • Section ${r.section}` : ' • All sections'}</p>
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
                          <button onClick={() => setRoutineToDelete(r)}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {routines.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No routines yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editRoutine ? 'Edit Class' : 'Add Class'} onClose={() => setShowModal(false)}>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-form-label">Department</label>
                <input
                  type="text"
                  required
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value, subjectId: '' })}
                  className="ui-form-input"
                  placeholder="e.g. BCA"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="ui-form-label">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: Number(e.target.value), subjectId: '' })}
                    className="ui-form-input"
                  />
                </div>
                <div>
                  <label className="ui-form-label">Section</label>
                  <input
                    type="text"
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    className="ui-form-input"
                    placeholder="Leave blank for all sections"
                  />
                </div>
              </div>
              <div>
                <label className="ui-form-label">Subject</label>
                <select required value={form.subjectId} onChange={(e) => handleSubjectChange(e.target.value)} className="ui-form-input">
                  <option value="">Select Subject</option>
                  {filteredSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.code} — {s.department || 'General'} — Semester {s.semester}
                    </option>
                  ))}
                </select>
                {form.department && filteredSubjects.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-600">No subjects match this department and semester yet.</p>
                ) : null}
              </div>
              <div>
                <label className="ui-form-label">Instructor</label>
                <select required value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })} className="ui-form-input">
                  <option value="">Select Instructor</option>
                  {instructors.filter(i => i.instructor?.id).map(i => (
                    <option key={i.instructor.id} value={i.instructor.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ui-form-label">Day Of Week</label>
                <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className="ui-form-input">
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="ui-form-label">Start Time</label>
                  <input type="time" required value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="ui-form-input" />
                </div>
                <div className="flex-1">
                  <label className="ui-form-label">End Time</label>
                  <input type="time" required value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="ui-form-input" />
                </div>
              </div>
              <div>
                <label className="ui-form-label">Room / Location</label>
                <input type="text"
                  value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}
                  className="ui-form-input" />
              </div>
              <div className="ui-modal-footer">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 font-medium">
                  {editRoutine ? 'Update' : 'Add Class'}
                </button>
              </div>
            </form>
        </Modal>
      )}
      <ConfirmDialog
        open={!!routineToDelete}
        title="Delete Routine Entry"
        message={routineToDelete ? `Delete the ${routineToDelete.dayOfWeek} ${routineToDelete.startTime} class entry?` : ''}
        confirmText="Delete Entry"
        busy={deletingRoutine}
        onClose={() => setRoutineToDelete(null)}
        onConfirm={handleDelete}
      />
    </AdminLayout>
  )
}

export default AdminRoutine


