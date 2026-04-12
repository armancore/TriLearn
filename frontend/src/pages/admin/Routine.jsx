import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import logger from '../../utils/logger'
import { isRequestCanceled } from '../../utils/http'
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const DAY_SHORT = { SUNDAY: 'Sun', MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat' }

const COLORS = [
  'routine-tone-1',
  'routine-tone-2',
  'routine-tone-3',
  'routine-tone-4',
  'routine-tone-5',
  'routine-tone-6',
  'routine-tone-7',
]

const defaultForm = {
  subjectId: '',
  instructorId: '',
  department: '',
  semester: 1,
  section: '',
  dayOfWeek: 'SUNDAY',
  startTime: '08:00',
  endTime: '09:00',
  room: ''
}

const AdminRoutine = () => {
  const { user } = useAuth()
  const { departments, loadDepartments } = useReferenceData()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
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
    const controller = new AbortController()
    void Promise.all([
      fetchRoutines(controller.signal),
      fetchSubjects(controller.signal),
      fetchInstructors(controller.signal),
      loadDepartments({ signal: controller.signal })
    ])
    return () => controller.abort()
  }, [loadDepartments])

  const fetchRoutines = async (signal) => {
    try {
      setLoading(true)
      const res = await api.get('/routines', { signal })
      setRoutines(res.data.routines)
    } catch (err) {
      if (isRequestCanceled(err)) return
      logger.error(err)
      setError(err.response?.data?.message || 'Unable to load routine entries right now.')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  const fetchSubjects = async (signal) => {
    try {
      const res = await api.get('/subjects', {
        signal,
        params: { limit: 100 }
      })
      setSubjects(res.data.subjects || [])
    } catch (err) {
      if (isRequestCanceled(err)) return
      logger.error(err)
    }
  }

  const fetchInstructors = async (signal) => {
    try {
      const res = await api.get('/admin/users', {
        signal,
        params: {
          role: 'INSTRUCTOR',
          limit: 100
        }
      })
      setInstructors((res.data.users || []).filter((item) => item.instructor?.id))
    } catch (err) {
      if (isRequestCanceled(err)) return
      logger.error(err)
      setError(err.response?.data?.message || 'Unable to load instructors right now.')
    }
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
  routines.forEach((r) => {
    if (!subjectColorMap[r.subjectId]) {
      subjectColorMap[r.subjectId] = COLORS[Object.keys(subjectColorMap).length % COLORS.length]
    }
  })

  const normalizeValue = (value) => String(value || '').trim().toLowerCase()
  const normalizeDepartmentKey = (value) => {
    const normalizedValue = normalizeValue(value)
    if (!normalizedValue) {
      return ''
    }

    const matchedDepartment = departments.find((department) => (
      normalizeValue(department.name) === normalizedValue || normalizeValue(department.code) === normalizedValue
    ))

    return matchedDepartment
      ? normalizeValue(matchedDepartment.name)
      : normalizedValue
  }

  const filteredSubjects = subjects.filter((subject) => {
    const semesterMatches = Number(subject.semester) === Number(form.semester)

    if (!semesterMatches) {
      return false
    }

    if (!form.department.trim()) {
      return true
    }

    return normalizeDepartmentKey(subject.department) === normalizeDepartmentKey(form.department)
  })

  const filteredInstructors = instructors.filter((instructor) => {
    if (isCoordinator) {
      return true
    }

    if (!form.department.trim()) {
      return true
    }

    return normalizeDepartmentKey(instructor.instructor?.department) === normalizeDepartmentKey(form.department)
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
    <Layout>
      <div className="p-8">

        <PageHeader
          title="Class Routine"
          subtitle="Manage weekly timetable"
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Routine']}
          actions={[{
            label: 'Add Class',
            icon: Plus,
            variant: 'primary',
            onClick: () => {
              setEditRoutine(null)
              setForm({
                ...defaultForm
              })
              setError('')
              setShowModal(true)
            }
          }]}
        />

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : (
          <>
            {/* Weekly Grid */}
            <div className="grid grid-cols-7 gap-3 mb-8">
              {DAYS.map(day => (
                <div key={day} className="min-h-[200px]">
                  {/* Day header */}
                  <div className="ui-role-fill text-center py-2 rounded-t-xl text-sm font-semibold mb-2">
                    {DAY_SHORT[day]}
                  </div>
                  {/* Classes */}
                  <div className="space-y-2">
                    {byDay[day].map(r => (
                      <div
                        key={r.id}
                        className={`border rounded-xl p-2 cursor-pointer hover:shadow-md dark:shadow-slate-900/50 transition ${subjectColorMap[r.subjectId]}`}
                        onClick={() => openEdit(r)}
                      >
                        <p className="text-xs font-bold truncate">{r.subject?.code}</p>
                        <p className="mt-1 text-[11px] opacity-80">Sem {r.semester}{r.section ? ` • Sec ${r.section}` : ''}</p>
                        <p className="text-xs truncate">{r.startTime}–{r.endTime}</p>
                        {r.room && <p className="text-xs opacity-75">🚪 {r.room}</p>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setRoutineToDelete(r) }}
                          className="status-absent mt-1 rounded px-1.5 py-0.5 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {byDay[day].length === 0 && (
                      <div className="text-center text-[var(--color-text-soft)] text-xs py-4">—</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* List view */}
            <div className="ui-card rounded-2xl overflow-hidden">
              <div className="border-b border-[var(--color-card-border)] p-4">
                <h2 className="font-semibold text-[var(--color-heading)]">All Entries</h2>
              </div>
              <table className="w-full">
                <thead className="bg-[var(--color-surface-muted)]">
                  <tr className="text-left text-sm text-[var(--color-text-muted)]">
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
                  {[...routines]
                    .sort((left, right) => {
                      const dayDiff = DAYS.indexOf(left.dayOfWeek) - DAYS.indexOf(right.dayOfWeek)
                      return dayDiff !== 0 ? dayDiff : left.startTime.localeCompare(right.startTime)
                    })
                    .map(r => (
                    <tr key={r.id} className="border-t border-[var(--color-card-border)] hover:bg-[var(--color-surface-muted)]/70">
                      <td className="px-6 py-3 text-sm font-medium text-[var(--color-heading)]">{DAY_SHORT[r.dayOfWeek]}</td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-[var(--color-heading)]">{r.subject?.name}</p>
                        <p className="text-xs text-[var(--color-text-soft)]">{r.subject?.code}</p>
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium text-[var(--color-heading)]">{r.department || 'General'}</p>
                        <p className="text-xs text-[var(--color-text-soft)]">Semester {r.semester}{r.section ? ` • Section ${r.section}` : ' • All sections'}</p>
                      </td>
                      <td className="px-6 py-3 text-sm text-[var(--color-text-muted)]">{r.instructor?.user?.name}</td>
                      <td className="px-6 py-3 text-sm text-[var(--color-text-muted)]">{r.startTime} – {r.endTime}</td>
                      <td className="px-6 py-3 text-sm text-[var(--color-text-muted)]">{r.room || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(r)}
                            className="grade-merit rounded-lg px-3 py-1 text-xs border">
                            Edit
                          </button>
                          <button onClick={() => setRoutineToDelete(r)}
                            className="status-absent rounded-lg px-3 py-1 text-xs border">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {routines.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-[var(--color-text-soft)]">No routines yet</td></tr>
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
            <Alert type="error" message={error} />
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
                  readOnly={false}
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
                  <p className="status-late mt-2 inline-flex rounded-lg px-2 py-1 text-xs">No subjects match this department and semester yet.</p>
                ) : null}
              </div>
              <div>
                <label className="ui-form-label">Instructor</label>
                <select required value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })} className="ui-form-input">
                  <option value="">Select Instructor</option>
                  {filteredInstructors.map(i => (
                    <option key={i.instructor.id} value={i.instructor.id}>{i.name}</option>
                  ))}
                </select>
                {form.department && filteredInstructors.length === 0 ? (
                  <p className="status-late mt-2 inline-flex rounded-lg px-2 py-1 text-xs">No instructors are available for this department yet.</p>
                ) : null}
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
                  className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
                <button type="submit"
                  className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium">
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
    </Layout>
  )
}

export default AdminRoutine


