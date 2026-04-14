import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
const getInstructorDepartments = (instructor) => (
  Array.isArray(instructor?.instructor?.departments) && instructor.instructor.departments.length > 0
    ? instructor.instructor.departments
    : [instructor?.instructor?.department].filter(Boolean)
)

const COLORS = [
  'routine-tone-1',
  'routine-tone-2',
  'routine-tone-3',
  'routine-tone-4',
  'routine-tone-5',
  'routine-tone-6',
  'routine-tone-7',
]

const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1))
const ALL_SECTION_FILTER_KEY = '__ALL_SECTIONS__'
const generateCombinedGroupId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return null
}

const defaultForm = {
  subjectId: '',
  instructorId: '',
  department: '',
  semester: '',
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
  const [createSectionScope, setCreateSectionScope] = useState('UNSET')
  const [createSectionsInput, setCreateSectionsInput] = useState('')
  const [viewFilters, setViewFilters] = useState({
    department: 'ALL',
    semester: 'ALL',
    sections: []
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

  const fetchInstructors = useCallback(async (signal) => {
    try {
      const res = await api.get('/admin/users', {
        signal,
        params: {
          role: 'INSTRUCTOR',
          limit: 100,
          ...(isCoordinator ? { includeAssignable: true } : {})
        }
      })
      setInstructors((res.data.users || []).filter((item) => item.instructor?.id))
    } catch (err) {
      if (isRequestCanceled(err)) return
      logger.error(err)
      setError(err.response?.data?.message || 'Unable to load instructors right now.')
    }
  }, [isCoordinator])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.allSettled([
      fetchRoutines(controller.signal),
      fetchSubjects(controller.signal),
      fetchInstructors(controller.signal),
      loadDepartments({ signal: controller.signal })
    ])
    return () => controller.abort()
  }, [fetchInstructors, loadDepartments])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const basePayload = {
        ...form,
        semester: Number(form.semester)
      }

      if (editRoutine) {
        await api.put(`/routines/${editRoutine.id}`, {
          ...basePayload,
          section: form.section.trim()
        })
        setSuccess('Routine updated!')
      } else {
        const combinedGroupId = createSectionScope === 'MULTIPLE' ? generateCombinedGroupId() : null
        const sectionTargets = createSectionScope === 'MULTIPLE'
          ? [...new Set(
            createSectionsInput
              .split(',')
              .map((value) => value.trim().toUpperCase())
              .filter(Boolean)
          )]
          : [createSectionScope === 'ONE' ? form.section.trim().toUpperCase() : '']

        const createResults = await Promise.allSettled(
          sectionTargets.map((section) => api.post('/routines', {
            ...basePayload,
            section,
            combinedGroupId: combinedGroupId || undefined
          }))
        )

        const failedResults = createResults.filter((result) => result.status === 'rejected')
        const createdCount = createResults.length - failedResults.length

        if (failedResults.length > 0 && createdCount === 0) {
          throw failedResults[0].reason
        }

        if (failedResults.length > 0) {
          const firstFailure = failedResults[0]?.reason?.response?.data?.message || 'Some section entries could not be created.'
          setSuccess(`Created ${createdCount} routine entries.`)
          setError(firstFailure)
        } else {
          setSuccess(createdCount > 1 ? `Created ${createdCount} routine entries!` : 'Routine created!')
        }
      }
      setShowModal(false)
      setEditRoutine(null)
      setForm(defaultForm)
      setCreateSectionScope('UNSET')
      setCreateSectionsInput('')
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
      semester: String(r.semester),
      section: r.section || '',
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room || ''
    })
    setCreateSectionScope(r.section ? 'ONE' : 'ALL')
    setCreateSectionsInput(r.section || '')
    setError('')
    setShowModal(true)
  }

  const normalizeValue = useCallback((value) => String(value || '').trim().toLowerCase(), [])
  const normalizeDepartmentKey = useCallback((value) => {
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
  }, [departments, normalizeValue])

  const filteredSubjects = subjects.filter((subject) => {
    if (!form.semester) {
      return false
    }

    const semesterMatches = Number(subject.semester) === Number(form.semester)

    if (!semesterMatches) {
      return false
    }

    if (!form.department.trim()) {
      return true
    }

    return normalizeDepartmentKey(subject.department) === normalizeDepartmentKey(form.department)
  })

  const configuredSectionOptions = useMemo(() => {
    const selectedDepartment = departments.find((department) => department.name === form.department)
    if (!selectedDepartment || !form.semester) {
      return []
    }

    const semesterEntry = (selectedDepartment.semesterSections || [])
      .find((entry) => String(entry.semester) === String(form.semester))

    if (!semesterEntry || !Array.isArray(semesterEntry.sections)) {
      return []
    }

    return [...new Set(
      semesterEntry.sections
        .map((section) => String(section || '').trim().toUpperCase())
        .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right))
  }, [departments, form.department, form.semester])

  const sectionOptionsForCreate = useMemo(() => (
    [...new Set([
      ...configuredSectionOptions,
      ...routines
        .filter((routine) => (
          normalizeDepartmentKey(routine.department) === normalizeDepartmentKey(form.department)
          && String(routine.semester) === String(form.semester)
          && routine.section
        ))
        .map((routine) => routine.section.trim().toUpperCase())
        .filter(Boolean)
    ])].sort((left, right) => left.localeCompare(right))
  ), [configuredSectionOptions, form.department, form.semester, normalizeDepartmentKey, routines])

  const filteredInstructors = instructors.filter((instructor) => {
    if (isCoordinator) {
      return true
    }

    if (!form.department.trim()) {
      return true
    }

    return getInstructorDepartments(instructor)
      .some((department) => normalizeDepartmentKey(department) === normalizeDepartmentKey(form.department))
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
      semester: String(subject.semester)
    })
  }

  const isCreateMode = !editRoutine
  const parsedCreateSections = [...new Set(
    createSectionsInput
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  )]
  const createScopeReady = !isCreateMode
    || (
      Boolean(form.department.trim())
      && Boolean(form.semester)
      && (
        createSectionScope === 'ALL'
        || (createSectionScope === 'ONE' && Boolean(form.section.trim()))
        || (createSectionScope === 'MULTIPLE' && parsedCreateSections.length > 0)
      )
    )

  useEffect(() => {
    if (!isCreateMode || createSectionScope !== 'ONE') {
      return
    }

    if (!form.department || !form.semester) {
      return
    }

    if (configuredSectionOptions.length === 0) {
      setForm((current) => ({ ...current, section: '' }))
      return
    }

    if (!configuredSectionOptions.includes(String(form.section || '').trim().toUpperCase())) {
      setForm((current) => ({ ...current, section: configuredSectionOptions[0] }))
    }
  }, [configuredSectionOptions, createSectionScope, form.department, form.section, form.semester, isCreateMode])

  const availableDepartmentFilters = useMemo(() => (
    [...new Set(
      [
        ...departments.map((department) => department.name),
        ...routines.map((routine) => routine.department).filter(Boolean)
      ].map((department) => department.trim())
    )].sort((left, right) => left.localeCompare(right))
  ), [departments, routines])

  const availableSemesterFilters = SEMESTER_OPTIONS

  const availableSectionFilters = useMemo(() => (
    [...new Set(
      routines
        .filter((routine) => (
          (viewFilters.department === 'ALL' || normalizeDepartmentKey(routine.department) === normalizeDepartmentKey(viewFilters.department))
          && (viewFilters.semester === 'ALL' || String(routine.semester) === String(viewFilters.semester))
        ))
        .map((routine) => routine.section?.trim().toUpperCase() || ALL_SECTION_FILTER_KEY)
    )].sort((left, right) => left.localeCompare(right))
  ), [normalizeDepartmentKey, routines, viewFilters.department, viewFilters.semester])

  const displayedRoutines = useMemo(() => (
    routines.filter((routine) => {
      const departmentMatches = viewFilters.department === 'ALL'
        || normalizeDepartmentKey(routine.department) === normalizeDepartmentKey(viewFilters.department)

      const semesterMatches = viewFilters.semester === 'ALL'
        || String(routine.semester) === String(viewFilters.semester)

      const sectionKey = routine.section?.trim().toUpperCase() || ALL_SECTION_FILTER_KEY
      const sectionMatches = viewFilters.sections.length === 0
        || viewFilters.sections.includes(sectionKey)

      return departmentMatches && semesterMatches && sectionMatches
    })
  ), [normalizeDepartmentKey, routines, viewFilters.department, viewFilters.sections, viewFilters.semester])

  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = displayedRoutines.filter(r => r.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
    return acc
  }, {})

  const subjectColorMap = {}
  displayedRoutines.forEach((r) => {
    if (!subjectColorMap[r.subjectId]) {
      subjectColorMap[r.subjectId] = COLORS[Object.keys(subjectColorMap).length % COLORS.length]
    }
  })

  const selectedSectionLabels = viewFilters.sections.map((section) => (
    section === ALL_SECTION_FILTER_KEY ? 'All Sections Entries' : section
  ))

  const handleToggleSectionFilter = (section) => {
    setViewFilters((current) => {
      const selected = current.sections.includes(section)
      return {
        ...current,
        sections: selected
          ? current.sections.filter((item) => item !== section)
          : [...current.sections, section]
      }
    })
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">

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
              setCreateSectionScope('UNSET')
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
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ui-card rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Visible Classes</p>
                <p className="mt-2 text-2xl font-black text-[var(--color-heading)]">{displayedRoutines.length}</p>
              </div>
              <div className="ui-card rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Filtered Department</p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{viewFilters.department === 'ALL' ? 'All Departments' : viewFilters.department}</p>
              </div>
              <div className="ui-card rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Filtered Semester</p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{viewFilters.semester === 'ALL' ? 'All Semesters' : `Semester ${viewFilters.semester}`}</p>
              </div>
              <div className="ui-card rounded-2xl p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Selected Sections</p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-heading)]">{selectedSectionLabels.length || 'All'}</p>
              </div>
            </div>

            <div className="ui-card mb-6 rounded-2xl p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--color-heading)]">Routine Filters</h2>
                <button
                  type="button"
                  onClick={() => setViewFilters({ department: 'ALL', semester: 'ALL', sections: [] })}
                  className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-heading)]"
                >
                  Reset All
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="ui-form-label">Department</label>
                  <select
                    className="ui-form-input"
                    value={viewFilters.department}
                    onChange={(e) => setViewFilters((current) => ({ ...current, department: e.target.value, sections: [] }))}
                  >
                    <option value="ALL">All Departments</option>
                    {availableDepartmentFilters.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">Semester</label>
                  <select
                    className="ui-form-input"
                    value={viewFilters.semester}
                    onChange={(e) => setViewFilters((current) => ({ ...current, semester: e.target.value, sections: [] }))}
                  >
                    <option value="ALL">All Semesters</option>
                    {availableSemesterFilters.map((semester) => (
                      <option key={semester} value={semester}>Semester {semester}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="ui-form-label mb-0">Sections (Multi-select)</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setViewFilters((current) => ({ ...current, sections: [...availableSectionFilters] }))}
                      className="rounded-lg border border-[var(--color-card-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFilters((current) => ({ ...current, sections: [] }))}
                      className="rounded-lg border border-[var(--color-card-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-3">
                  {availableSectionFilters.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-soft)]">No sections available for the current department-semester filter.</p>
                  ) : (
                    <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                      {availableSectionFilters.map((section) => {
                        const selected = viewFilters.sections.includes(section)
                        const label = section === ALL_SECTION_FILTER_KEY ? 'All Sections Entries' : section
                        return (
                          <label
                            key={section}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                              selected
                                ? 'border-transparent ui-role-fill text-white'
                                : 'border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleToggleSectionFilter(section)}
                              className="h-3.5 w-3.5 accent-[var(--color-role-accent)]"
                            />
                            <span className="truncate">{label}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                {selectedSectionLabels.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedSectionLabels.map((label) => (
                      <span key={label} className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--color-text-soft)]">No specific section selected. Showing all sections.</p>
                )}
              </div>
            </div>

            {/* Weekly Grid */}
            <div className="mb-8 overflow-x-auto rounded-2xl">
            <div className="grid min-w-[1040px] grid-cols-7 gap-3">
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
                        {r.room && <p className="text-xs opacity-75">Room: {r.room}</p>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setRoutineToDelete(r) }}
                          className="status-absent mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
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
                  {[...displayedRoutines]
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
                  {displayedRoutines.length === 0 && (
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
              {isCreateMode ? (
                <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">Creation Filters</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose department, semester, and section scope before creating a routine entry.</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="ui-form-label">Department</label>
                      <select
                        required
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value, subjectId: '', instructorId: '' })}
                        className="ui-form-input"
                      >
                        <option value="">Select Department</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.name}>
                            {department.name}{department.code ? ` (${department.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ui-form-label">Semester</label>
                      <select
                        required
                        value={form.semester}
                        onChange={(e) => setForm({ ...form, semester: e.target.value, subjectId: '' })}
                        className="ui-form-input"
                      >
                        <option value="">Select Semester</option>
                        {SEMESTER_OPTIONS.map((semester) => (
                          <option key={semester} value={semester}>
                            Semester {semester}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ui-form-label">Section</label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCreateSectionScope('ALL')
                            setForm((current) => ({ ...current, section: '' }))
                            setCreateSectionsInput('')
                          }}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            createSectionScope === 'ALL'
                              ? 'ui-role-fill border-transparent text-white'
                              : 'border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]'
                          }`}
                        >
                          All Sections
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateSectionScope('ONE')
                            setCreateSectionsInput('')
                          }}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            createSectionScope === 'ONE'
                              ? 'ui-role-fill border-transparent text-white'
                              : 'border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]'
                          }`}
                        >
                          Specific Section
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateSectionScope('MULTIPLE')
                            setForm((current) => ({ ...current, section: '' }))
                          }}
                          className={`rounded-lg border px-3 py-2 text-sm sm:col-span-2 ${
                            createSectionScope === 'MULTIPLE'
                              ? 'ui-role-fill border-transparent text-white'
                              : 'border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]'
                          }`}
                        >
                          Combine Multiple Sections
                        </button>
                      </div>
                      {createSectionScope === 'ONE' ? (
                        configuredSectionOptions.length > 0 ? (
                          <select
                            value={form.section}
                            onChange={(e) => setForm({ ...form, section: e.target.value })}
                            className="ui-form-input mt-3"
                          >
                            {configuredSectionOptions.map((section) => (
                              <option key={section} value={section}>{section}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-3 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
                            No sections configured for this department and semester. Create sections in Departments first.
                          </div>
                        )
                      ) : null}
                      {createSectionScope === 'MULTIPLE' ? (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            value={createSectionsInput}
                            onChange={(e) => setCreateSectionsInput(e.target.value)}
                            className="ui-form-input"
                            placeholder="e.g. A, B, C"
                          />
                          <p className="text-xs text-[var(--color-text-soft)]">
                            Use comma-separated sections to create the same routine for each section in one submit.
                          </p>
                          {sectionOptionsForCreate.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {sectionOptionsForCreate.map((section) => (
                                <button
                                  key={section}
                                  type="button"
                                  onClick={() => {
                                    setCreateSectionsInput((current) => {
                                      const currentTokens = current.split(',').map((item) => item.trim()).filter(Boolean)
                                      return [...new Set([...currentTokens.map((token) => token.toUpperCase()), section])].join(', ')
                                    })
                                  }}
                                  className="rounded-full border border-[var(--color-card-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                                >
                                  {section}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
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
              )}

              {!isCreateMode ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="ui-form-label">Semester</label>
                    <select
                      required
                      value={form.semester}
                      onChange={(e) => setForm({ ...form, semester: e.target.value, subjectId: '' })}
                      className="ui-form-input"
                    >
                      <option value="">Select Semester</option>
                      {SEMESTER_OPTIONS.map((semester) => (
                        <option key={semester} value={semester}>
                          Semester {semester}
                        </option>
                      ))}
                    </select>
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
              ) : null}

              {!createScopeReady ? (
                <p className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
                  Complete department, semester, and section selection to start creating routine details.
                </p>
              ) : (
                <>
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
                        <option key={i.instructor.id} value={i.instructor.id}>
                          {i.name} {getInstructorDepartments(i).length > 0 ? `— ${getInstructorDepartments(i).join(', ')}` : ''}
                        </option>
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
                </>
              )}

              <div className="ui-modal-footer">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">Cancel</button>
                <button type="submit"
                  disabled={!createScopeReady}
                  className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">
                  {editRoutine ? 'Update' : createSectionScope === 'MULTIPLE' ? `Add Classes (${parsedCreateSections.length || 0})` : 'Add Class'}
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


