import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import logger from '../../utils/logger'
import { isRequestCanceled } from '../../utils/http'

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const SEMESTERS = Array.from({ length: 12 }, (_, index) => index + 1)

const defaultWindowForm = {
  id: '',
  title: '',
  dayOfWeek: 'SUNDAY',
  startTime: '09:00',
  endTime: '09:45',
  allowedSemesters: [],
  isActive: true
}

const defaultHolidayForm = {
  id: '',
  date: '',
  title: '',
  description: '',
  isActive: true
}

const formatDay = (value) => value.charAt(0) + value.slice(1).toLowerCase()

const StudentQrSettings = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [windows, setWindows] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [windowModalOpen, setWindowModalOpen] = useState(false)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false)
  const [windowForm, setWindowForm] = useState(defaultWindowForm)
  const [holidayForm, setHolidayForm] = useState(defaultHolidayForm)
  const [savingWindow, setSavingWindow] = useState(false)
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deletingItem, setDeletingItem] = useState(false)
  const { showToast } = useToast()

  const groupedWindows = useMemo(() => (
    DAYS.map((day) => ({
      day,
      items: windows.filter((window) => window.dayOfWeek === day)
    }))
  ), [windows])

  const loadSettings = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')
      const res = await api.get('/attendance/gate-settings', { signal })
      setWindows(res.data.windows || [])
      setHolidays(res.data.holidays || [])
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      logger.error(requestError)
      setError(requestError.response?.data?.message || 'Unable to load Student QR settings')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadSettings(controller.signal)
    return () => controller.abort()
  }, [loadSettings])

  const openCreateWindow = () => {
    setWindowForm(defaultWindowForm)
    setWindowModalOpen(true)
  }

  const openEditWindow = (window) => {
    setWindowForm({
      id: window.id,
      title: window.title || '',
      dayOfWeek: window.dayOfWeek,
      startTime: window.startTime,
      endTime: window.endTime,
      allowedSemesters: window.allowedSemesters || [],
      isActive: window.isActive
    })
    setWindowModalOpen(true)
  }

  const openCreateHoliday = () => {
    setHolidayForm(defaultHolidayForm)
    setHolidayModalOpen(true)
  }

  const toggleSemester = (semester) => {
    setWindowForm((current) => ({
      ...current,
      allowedSemesters: current.allowedSemesters.includes(semester)
        ? current.allowedSemesters.filter((value) => value !== semester)
        : [...current.allowedSemesters, semester].sort((left, right) => left - right)
    }))
  }

  const saveWindow = async (event) => {
    event.preventDefault()

    if (windowForm.allowedSemesters.length === 0) {
      setError('Choose at least one semester for the Student QR window.')
      return
    }

    try {
      setSavingWindow(true)
      setError('')

      const payload = {
        title: windowForm.title || undefined,
        dayOfWeek: windowForm.dayOfWeek,
        startTime: windowForm.startTime,
        endTime: windowForm.endTime,
        allowedSemesters: windowForm.allowedSemesters,
        isActive: windowForm.isActive
      }

      if (windowForm.id) {
        await api.put(`/attendance/gate-settings/windows/${windowForm.id}`, payload)
        showToast({ title: 'Student QR window updated successfully.' })
      } else {
        await api.post('/attendance/gate-settings/windows', payload)
        showToast({ title: 'Student QR window created successfully.' })
      }

      setWindowModalOpen(false)
      await loadSettings()
    } catch (requestError) {
      logger.error(requestError)
      setError(requestError.response?.data?.message || 'Unable to save the Student QR window')
    } finally {
      setSavingWindow(false)
    }
  }

  const saveHoliday = async (event) => {
    event.preventDefault()

    try {
      setSavingHoliday(true)
      setError('')
      await api.post('/attendance/gate-settings/holidays', {
        date: holidayForm.date,
        title: holidayForm.title,
        description: holidayForm.description || undefined,
        isActive: holidayForm.isActive
      })
      setHolidayModalOpen(false)
      showToast({ title: 'Holiday saved successfully.' })
      await loadSettings()
    } catch (requestError) {
      logger.error(requestError)
      setError(requestError.response?.data?.message || 'Unable to save the holiday')
    } finally {
      setSavingHoliday(false)
    }
  }

  const confirmDeleteWindow = (windowItem) => {
    setPendingDelete({
      type: 'window',
      id: windowItem.id,
      title: 'Delete Student QR Window',
      message: `Delete "${windowItem.title || `${windowItem.startTime} - ${windowItem.endTime}`}"?`
    })
  }

  const confirmDeleteHoliday = (holiday) => {
    setPendingDelete({
      type: 'holiday',
      id: holiday.id,
      title: 'Delete Holiday',
      message: `Delete "${holiday.title}"?`
    })
  }

  const handleDelete = async () => {
    if (!pendingDelete) return

    try {
      setDeletingItem(true)
      setError('')

      if (pendingDelete.type === 'window') {
        await api.delete(`/attendance/gate-settings/windows/${pendingDelete.id}`)
        showToast({ title: 'Student QR window deleted successfully.' })
      } else {
        await api.delete(`/attendance/gate-settings/holidays/${pendingDelete.id}`)
        showToast({ title: 'Holiday removed successfully.' })
      }

      setPendingDelete(null)
      await loadSettings()
    } catch (requestError) {
      logger.error(requestError)
      setError(
        requestError.response?.data?.message || (
          pendingDelete.type === 'window'
            ? 'Unable to delete the Student QR window'
            : 'Unable to delete the holiday'
        )
      )
    } finally {
      setDeletingItem(false)
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Student QR Settings"
          subtitle="Set which semesters may scan the gate Student QR at each time slot, and define holidays that skip attendance deduction."
          breadcrumbs={['Admin', 'Student QR']}
          actions={[
            { label: 'Add Window', icon: Plus, variant: 'primary', onClick: openCreateWindow },
            { label: 'Add Holiday', icon: CalendarDays, variant: 'secondary', onClick: openCreateHoliday }
          ]}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="ui-card h-80 rounded-3xl" />
            <div className="ui-card h-80 rounded-3xl" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="ui-card rounded-3xl p-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Semester Windows</h2>
                  <p className="mt-1 text-sm text-slate-500">Each window controls which semesters may scan the Student QR during that time range.</p>
                </div>
                <span className="ui-status-badge ui-status-neutral">{windows.length} windows</span>
              </div>

              <div className="space-y-6">
                {groupedWindows.map(({ day, items }) => (
                  <div key={day}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{formatDay(day)}</h3>
                      <span className="text-xs text-slate-400">{items.length} slot{items.length === 1 ? '' : 's'}</span>
                    </div>
                    {items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
                        No Student QR window for this day.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {items.map((windowItem) => (
                          <div key={windowItem.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{windowItem.title || `${windowItem.startTime} - ${windowItem.endTime}`}</p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {windowItem.startTime} to {windowItem.endTime}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {windowItem.allowedSemesters.map((semester) => (
                                    <span key={semester} className="ui-status-badge ui-status-info">Semester {semester}</span>
                                  ))}
                                  {!windowItem.isActive ? <span className="ui-status-badge ui-status-danger">Inactive</span> : null}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => openEditWindow(windowItem)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                                  <Pencil className="h-4 w-4" />
                                  <span>Edit</span>
                                </button>
                                <button type="button" onClick={() => confirmDeleteWindow(windowItem)} className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100">
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="ui-card rounded-3xl p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Holidays</h2>
                    <p className="mt-1 text-sm text-slate-500">Students are never marked absent on these dates.</p>
                  </div>
                  <span className="ui-status-badge ui-status-success">{holidays.length} holidays</span>
                </div>

                {holidays.length === 0 ? (
                  <EmptyState
                    icon="🏖️"
                    title="No holidays added yet"
                    description="Add holiday dates here so attendance is skipped and percentages are not deducted."
                  />
                ) : (
                  <div className="space-y-3">
                    {holidays.map((holiday) => (
                      <div key={holiday.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{holiday.title}</p>
                            <p className="mt-1 text-sm text-slate-500">{new Date(holiday.date).toLocaleDateString()}</p>
                            {holiday.description ? <p className="mt-3 text-sm text-slate-600">{holiday.description}</p> : null}
                          </div>
                          <button type="button" onClick={() => confirmDeleteHoliday(holiday)} className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100">
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ui-card rounded-3xl p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Logic Summary</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Students can scan only during an active window that includes their semester. If the day is not a holiday and they never scan before their semester&apos;s last window ends, the system marks them absent for that day&apos;s scheduled subjects unless an instructor records attendance manually.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {windowModalOpen ? (
        <Modal title={windowForm.id ? 'Edit Student QR Window' : 'Add Student QR Window'} onClose={() => setWindowModalOpen(false)}>
          <form onSubmit={saveWindow} className="space-y-4">
            <div>
              <label className="ui-form-label">Title</label>
              <input
                type="text"
                value={windowForm.title}
                onChange={(event) => setWindowForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Optional label like Morning Gate Slot"
                className="ui-form-input"
              />
            </div>

            <div>
              <label className="ui-form-label">Day</label>
              <select value={windowForm.dayOfWeek} onChange={(event) => setWindowForm((current) => ({ ...current, dayOfWeek: event.target.value }))} className="ui-form-input">
                {DAYS.map((day) => <option key={day} value={day}>{formatDay(day)}</option>)}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="ui-form-label">Start Time</label>
                <input type="time" value={windowForm.startTime} onChange={(event) => setWindowForm((current) => ({ ...current, startTime: event.target.value }))} className="ui-form-input" />
              </div>
              <div>
                <label className="ui-form-label">End Time</label>
                <input type="time" value={windowForm.endTime} onChange={(event) => setWindowForm((current) => ({ ...current, endTime: event.target.value }))} className="ui-form-input" />
              </div>
            </div>

            <div>
              <label className="ui-form-label">Allowed Semesters</label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {SEMESTERS.map((semester) => {
                  const selected = windowForm.allowedSemesters.includes(semester)
                  return (
                    <button
                      key={semester}
                      type="button"
                      onClick={() => toggleSemester(semester)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${selected ? 'border-[var(--color-role-accent)] bg-[var(--color-role-accent)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Semester {semester}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={windowForm.isActive}
                onChange={(event) => setWindowForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>Window is active</span>
            </label>

            <div className="ui-modal-footer">
              <button type="button" onClick={() => setWindowModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={savingWindow} className="rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {savingWindow ? 'Saving...' : windowForm.id ? 'Update Window' : 'Create Window'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {holidayModalOpen ? (
        <Modal title="Add Holiday" onClose={() => setHolidayModalOpen(false)}>
          <form onSubmit={saveHoliday} className="space-y-4">
            <div>
              <label className="ui-form-label">Holiday Date</label>
              <input type="date" value={holidayForm.date} onChange={(event) => setHolidayForm((current) => ({ ...current, date: event.target.value }))} className="ui-form-input" required />
            </div>
            <div>
              <label className="ui-form-label">Title</label>
              <input type="text" value={holidayForm.title} onChange={(event) => setHolidayForm((current) => ({ ...current, title: event.target.value }))} className="ui-form-input" placeholder="Holiday title" required />
            </div>
            <div>
              <label className="ui-form-label">Description</label>
              <textarea rows={3} value={holidayForm.description} onChange={(event) => setHolidayForm((current) => ({ ...current, description: event.target.value }))} className="ui-form-input" placeholder="Optional note for this holiday" />
            </div>
            <div className="ui-modal-footer">
              <button type="button" onClick={() => setHolidayModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={savingHoliday} className="rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {savingHoliday ? 'Saving...' : 'Save Holiday'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.title || 'Confirm Delete'}
        message={pendingDelete?.message || ''}
        confirmText="Delete"
        busy={deletingItem}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default StudentQrSettings
