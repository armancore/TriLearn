import { useEffect, useMemo, useState } from 'react'
import { Layers, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const emptyForm = { name: '', code: '', description: '' }
const emptySectionForm = { semester: '1', section: '' }
const emptyInstructorForm = { name: '', email: '', password: '', phone: '', departments: [] }
const emptyExistingInstructorState = { search: '', selectedId: '' }

const getInstructorDepartments = (instructor) => (
  Array.isArray(instructor?.departments) && instructor.departments.length > 0
    ? instructor.departments
    : [instructor?.department].filter(Boolean)
)

const Departments = () => {
  const { user } = useAuth()
  const { loadDepartments } = useReferenceData()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [departmentToDelete, setDepartmentToDelete] = useState(null)
  const [deletingDepartment, setDeletingDepartment] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInstructorListModal, setShowInstructorListModal] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState(null)
  const [departmentInstructors, setDepartmentInstructors] = useState([])
  const [loadingDepartmentInstructors, setLoadingDepartmentInstructors] = useState(false)
  const [showAddInstructorModal, setShowAddInstructorModal] = useState(false)
  const [addInstructorMode, setAddInstructorMode] = useState('create')
  const [creatingInstructor, setCreatingInstructor] = useState(false)
  const [assigningInstructor, setAssigningInstructor] = useState(false)
  const [instructorForm, setInstructorForm] = useState(emptyInstructorForm)
  const [existingInstructorState, setExistingInstructorState] = useState(emptyExistingInstructorState)
  const [assignableInstructors, setAssignableInstructors] = useState([])
  const [loadingAssignableInstructors, setLoadingAssignableInstructors] = useState(false)
  const [instructorError, setInstructorError] = useState('')
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [selectedDepartmentSections, setSelectedDepartmentSections] = useState([])
  const [loadingSections, setLoadingSections] = useState(false)
  const [creatingSection, setCreatingSection] = useState(false)
  const [deletingSectionId, setDeletingSectionId] = useState('')
  const [sectionForm, setSectionForm] = useState(emptySectionForm)
  const { showToast } = useToast()

  const selectedDepartmentInstructors = useMemo(() => (
    departmentInstructors.filter((staff) => getInstructorDepartments(staff.instructor).includes(selectedDepartment?.name))
  ), [departmentInstructors, selectedDepartment])

  useEffect(() => {
    const controller = new AbortController()

    const fetchDepartments = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await api.get('/departments', {
          signal: controller.signal,
          timeout: 10000
        })

        if (controller.signal.aborted) {
          return
        }

        setDepartments(response.data.departments || [])
      } catch (requestError) {
        if (isRequestCanceled(requestError)) {
          return
        }

        logger.error('Failed to load departments', requestError)
        setError(getFriendlyErrorMessage(requestError, 'Unable to load departments right now.'))
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchDepartments()

    return () => controller.abort()
  }, [])

  const fetchDepartments = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.get('/departments', { timeout: 10000 })
      setDepartments(response.data.departments || [])
    } catch (requestError) {
      logger.error('Failed to reload departments', requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to load departments right now.'))
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingDepartment(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const fetchDepartmentInstructors = async (department) => {
    try {
      setLoadingDepartmentInstructors(true)
      setInstructorError('')
      const response = await api.get('/admin/users', {
        params: {
          role: 'INSTRUCTOR',
          limit: 100,
          search: department.name
        },
        timeout: 10000
      })

      const matchedInstructors = (response.data.users || []).filter((staff) => (
        getInstructorDepartments(staff.instructor).includes(department.name)
      ))

      setDepartmentInstructors(matchedInstructors)
    } catch (requestError) {
      logger.error('Failed to load department instructors', requestError)
      setInstructorError(getFriendlyErrorMessage(requestError, 'Unable to load instructors for this department right now.'))
    } finally {
      setLoadingDepartmentInstructors(false)
    }
  }

  const openInstructorListModal = (department) => {
    setSelectedDepartment(department)
    setDepartmentInstructors([])
    setShowInstructorListModal(true)
    void fetchDepartmentInstructors(department)
  }

  const openAddInstructorModal = (department) => {
    setSelectedDepartment(department)
    setAddInstructorMode('create')
    setInstructorError('')
    setInstructorForm({
      ...emptyInstructorForm,
      departments: [department.name]
    })
    setExistingInstructorState(emptyExistingInstructorState)
    setAssignableInstructors([])
    setShowAddInstructorModal(true)
  }

  const fetchAssignableInstructors = async (department, search = '') => {
    try {
      setLoadingAssignableInstructors(true)
      setInstructorError('')
      const response = await api.get('/admin/users', {
        params: {
          role: 'INSTRUCTOR',
          limit: 100,
          includeAssignable: true,
          ...(search.trim() ? { search: search.trim() } : {})
        },
        timeout: 10000
      })

      const availableInstructors = (response.data.users || []).filter((staff) => (
        !getInstructorDepartments(staff.instructor).includes(department.name)
      ))

      setAssignableInstructors(availableInstructors)
    } catch (requestError) {
      logger.error('Failed to load assignable instructors', requestError)
      setInstructorError(getFriendlyErrorMessage(requestError, 'Unable to load existing instructors right now.'))
    } finally {
      setLoadingAssignableInstructors(false)
    }
  }

  const openEditModal = (department) => {
    setEditingDepartment(department)
    setForm({
      name: department.name,
      code: department.code,
      description: department.description || ''
    })
    setError('')
    setShowModal(true)
  }

  const fetchDepartmentSections = async (department) => {
    if (!department?.id) {
      return
    }

    try {
      setLoadingSections(true)
      setInstructorError('')
      const response = await api.get(`/departments/${department.id}/sections`, {
        timeout: 10000
      })
      setSelectedDepartmentSections(response.data.sections || [])
    } catch (requestError) {
      logger.error('Failed to load department sections', requestError)
      setInstructorError(getFriendlyErrorMessage(requestError, 'Unable to load sections for this department right now.'))
    } finally {
      setLoadingSections(false)
    }
  }

  const openSectionModal = (department) => {
    setSelectedDepartment(department)
    setSectionForm(emptySectionForm)
    setSelectedDepartmentSections([])
    setInstructorError('')
    setShowSectionModal(true)
    void fetchDepartmentSections(department)
  }

  const handleCreateSection = async (event) => {
    event.preventDefault()
    if (!selectedDepartment?.id) {
      setInstructorError('Please choose a department first.')
      return
    }

    try {
      setCreatingSection(true)
      setInstructorError('')
      await api.post(`/departments/${selectedDepartment.id}/sections`, {
        semester: Number(sectionForm.semester),
        section: sectionForm.section
      })
      showToast({
        title: 'Section created successfully.',
        description: `${selectedDepartment.name} semester ${sectionForm.semester} now includes section ${sectionForm.section.toUpperCase()}.`
      })
      setSectionForm((current) => ({ ...current, section: '' }))
      await Promise.all([
        fetchDepartmentSections(selectedDepartment),
        fetchDepartments(),
        loadDepartments({ force: true })
      ])
    } catch (requestError) {
      setInstructorError(getFriendlyErrorMessage(requestError, 'Unable to create section right now.'))
    } finally {
      setCreatingSection(false)
    }
  }

  const handleDeleteSection = async (sectionId) => {
    if (!selectedDepartment?.id || !sectionId) {
      return
    }

    try {
      setDeletingSectionId(sectionId)
      setInstructorError('')
      await api.delete(`/departments/${selectedDepartment.id}/sections/${sectionId}`)
      showToast({ title: 'Section removed successfully.' })
      await Promise.all([
        fetchDepartmentSections(selectedDepartment),
        fetchDepartments(),
        loadDepartments({ force: true })
      ])
    } catch (requestError) {
      setInstructorError(getFriendlyErrorMessage(requestError, 'Unable to delete section right now.'))
    } finally {
      setDeletingSectionId('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (editingDepartment) {
        await api.put(`/departments/${editingDepartment.id}`, form)
        showToast({ title: 'Department updated successfully.' })
      } else {
        await api.post('/departments', form)
        showToast({ title: 'Department created successfully.' })
      }

      setShowModal(false)
      setForm(emptyForm)
      setEditingDepartment(null)
      await fetchDepartments()
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, 'Unable to save the department right now.'))
    }
  }

  const handleDelete = async () => {
    if (!departmentToDelete) return
    try {
      setDeletingDepartment(true)
      const target = departmentToDelete
      setDepartmentToDelete(null)
      setDepartments((current) => current.filter((department) => department.id !== target.id))
      await api.delete(`/departments/${target.id}`)
      showToast({ title: 'Department deleted successfully.' })
    } catch (deleteError) {
      await fetchDepartments()
      setError(getFriendlyErrorMessage(deleteError, 'Unable to delete the department right now.'))
    } finally {
      setDeletingDepartment(false)
    }
  }

  const handleInstructorSubmit = async (event) => {
    event.preventDefault()
    setInstructorError('')

    if (!selectedDepartment?.name) {
      setInstructorError('Please choose a department first.')
      return
    }

    if (!instructorForm.name.trim()) {
      setInstructorError('Instructor name is required.')
      return
    }

    if (!instructorForm.email.trim()) {
      setInstructorError('Instructor email is required.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(instructorForm.email)) {
      setInstructorError('Enter a valid instructor email address.')
      return
    }

    if (instructorForm.password.length < 8 || !/[A-Z]/.test(instructorForm.password) || !/[a-z]/.test(instructorForm.password) || !/[0-9]/.test(instructorForm.password)) {
      setInstructorError('Password must be at least 8 characters and include uppercase, lowercase, and a number.')
      return
    }

    try {
      setCreatingInstructor(true)
      await api.post('/admin/users/instructor', {
        name: instructorForm.name.trim(),
        email: instructorForm.email.trim(),
        password: instructorForm.password,
        phone: instructorForm.phone.trim(),
        address: '',
        departments: [selectedDepartment.name]
      })

      showToast({
        title: 'Instructor created successfully.',
        description: `${selectedDepartment.name} has been assigned to the new instructor.`
      })

      setShowAddInstructorModal(false)
      setInstructorForm(emptyInstructorForm)
      await Promise.all([
        fetchDepartments(),
        fetchDepartmentInstructors(selectedDepartment),
        loadDepartments({ force: true })
      ])
    } catch (submitError) {
      setInstructorError(getFriendlyErrorMessage(submitError, 'Unable to create the instructor right now.'))
    } finally {
      setCreatingInstructor(false)
    }
  }

  const handleAssignExistingInstructor = async (event) => {
    event.preventDefault()
    setInstructorError('')

    if (!selectedDepartment?.name) {
      setInstructorError('Please choose a department first.')
      return
    }

    const selectedInstructor = assignableInstructors.find((staff) => staff.id === existingInstructorState.selectedId)
    if (!selectedInstructor) {
      setInstructorError('Select an existing instructor first.')
      return
    }

    try {
      setAssigningInstructor(true)
      const nextDepartments = Array.from(new Set([
        ...getInstructorDepartments(selectedInstructor.instructor),
        selectedDepartment.name
      ]))

      await api.put(`/admin/users/${selectedInstructor.id}`, {
        departments: nextDepartments
      })

      showToast({
        title: 'Instructor assigned successfully.',
        description: `${selectedInstructor.name} can now teach in ${selectedDepartment.name}.`
      })

      setShowAddInstructorModal(false)
      setExistingInstructorState(emptyExistingInstructorState)
      setAssignableInstructors([])
      await Promise.all([
        fetchDepartments(),
        fetchDepartmentInstructors(selectedDepartment),
        loadDepartments({ force: true })
      ])
    } catch (submitError) {
      setInstructorError(getFriendlyErrorMessage(submitError, 'Unable to assign the instructor to this department right now.'))
    } finally {
      setAssigningInstructor(false)
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Departments"
          subtitle="Create and manage the departments used across users and subjects."
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Departments']}
          actions={[{ label: 'Add Department', icon: Plus, variant: 'primary', onClick: openCreateModal }]}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-44" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {departments.map((department) => (
              <div key={department.id} className="ui-card rounded-2xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="grade-merit rounded px-2 py-1 text-xs font-bold">
                      {department.code}
                    </span>
                    <h3 className="mt-2 font-semibold text-[var(--color-heading)]">{department.name}</h3>
                  </div>
                </div>

                {department.description && (
                  <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-muted)]">{department.description}</p>
                )}

                <div className="mb-4 flex gap-4 text-xs text-[var(--color-text-muted)]">
                  <span>👨‍🎓 {department._count?.students || 0} students</span>
                  <span>👩‍🏫 {department._count?.instructors || 0} instructors</span>
                  <span>📚 {department._count?.subjects || 0} subjects</span>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openInstructorListModal(department)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--color-heading)] transition hover:bg-[var(--color-surface-subtle)]"
                  >
                    <Users className="h-4 w-4" />
                    <span>View Instructors</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddInstructorModal(department)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition hover:bg-primary"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Add Instructor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openSectionModal(department)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--color-heading)] transition hover:bg-[var(--color-surface-subtle)] sm:col-span-2"
                  >
                    <Layers className="h-4 w-4" />
                    <span>Manage Semester Sections</span>
                  </button>
                </div>

                {Array.isArray(department.semesterSections) && department.semesterSections.length > 0 ? (
                  <div className="mb-4 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-soft)]">Semester Sections</p>
                    <div className="mt-2 space-y-2">
                      {department.semesterSections.map((entry) => (
                        <p key={`${department.id}-${entry.semester}`} className="text-xs text-[var(--color-text-muted)]">
                          Semester {entry.semester}: <span className="font-medium text-[var(--color-heading)]">{entry.sections.join(', ')}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    No semester sections configured yet.
                  </div>
                )}

                <div className="flex gap-2 border-t border-[var(--color-card-border)] pt-4">
                  <button
                    type="button"
                    onClick={() => openEditModal(department)}
                    className="grade-merit flex-1 rounded-lg border py-2 text-xs font-medium transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepartmentToDelete(department)}
                    className="status-absent flex-1 rounded-lg border py-2 text-xs font-medium transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {departments.length === 0 && (
              <div className="col-span-3">
                <EmptyState
                  icon="🏛️"
                  title="No departments yet"
                  description="Create your first department so students, instructors, and subjects can be organized properly."
                  action={(
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="ui-role-fill rounded-lg px-4 py-2 text-sm font-medium"
                    >
                      Add Department
                    </button>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editingDepartment ? 'Edit Department' : 'Add Department'} onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-form-label">Department Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Department Code</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="ui-form-input"
                />
              </div>
              <div className="ui-modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
                  Cancel
                </button>
                <button type="submit" className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium">
                  {editingDepartment ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {showInstructorListModal && (
        <Modal
          title={`${selectedDepartment?.name || 'Department'} Instructors`}
          onClose={() => {
            setShowInstructorListModal(false)
            setInstructorError('')
          }}
        >
          <Alert type="error" message={instructorError} />

          {loadingDepartmentInstructors ? (
            <LoadingSkeleton rows={4} itemClassName="h-20" />
          ) : selectedDepartmentInstructors.length === 0 ? (
            <EmptyState
              icon="👩‍🏫"
              title="No instructors assigned"
              description={`No instructors are assigned to ${selectedDepartment?.name || 'this department'} yet.`}
              action={(
                <button
                  type="button"
                  onClick={() => {
                    setShowInstructorListModal(false)
                    if (selectedDepartment) {
                      openAddInstructorModal(selectedDepartment)
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Add Instructor</span>
                </button>
              )}
            />
          ) : (
            <div className="space-y-3">
              {selectedDepartmentInstructors.map((staff) => (
                <div key={staff.id} className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-heading)]">{staff.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{staff.email}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${staff.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {staff.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                    Departments: {getInstructorDepartments(staff.instructor).join(', ') || 'Not assigned'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showAddInstructorModal && (
        <Modal
          title={`Add Instructor to ${selectedDepartment?.name || 'Department'}`}
          onClose={() => {
            if (!creatingInstructor && !assigningInstructor) {
              setShowAddInstructorModal(false)
              setInstructorError('')
            }
          }}
        >
          <Alert type="error" message={instructorError} />
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-2">
            <button
              type="button"
              onClick={() => {
                setAddInstructorMode('create')
                setInstructorError('')
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${addInstructorMode === 'create' ? 'bg-primary text-white' : 'text-[var(--color-heading)]'}`}
            >
              Create New
            </button>
            <button
              type="button"
              onClick={() => {
                setAddInstructorMode('existing')
                setInstructorError('')
                if (selectedDepartment) {
                  void fetchAssignableInstructors(selectedDepartment, existingInstructorState.search)
                }
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${addInstructorMode === 'existing' ? 'bg-primary text-white' : 'text-[var(--color-heading)]'}`}
            >
              Assign Existing
            </button>
          </div>

          {addInstructorMode === 'create' ? (
            <form onSubmit={handleInstructorSubmit} className="space-y-4">
              <div>
                <label className="ui-form-label">Full Name</label>
                <input
                  type="text"
                  required
                  value={instructorForm.name}
                  onChange={(event) => setInstructorForm((current) => ({ ...current, name: event.target.value }))}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Email</label>
                <input
                  type="email"
                  required
                  value={instructorForm.email}
                  onChange={(event) => setInstructorForm((current) => ({ ...current, email: event.target.value }))}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Password</label>
                <input
                  type="password"
                  required
                  value={instructorForm.password}
                  onChange={(event) => setInstructorForm((current) => ({ ...current, password: event.target.value }))}
                  className="ui-form-input"
                />
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Use at least 8 characters with uppercase, lowercase, and a number.
                </p>
              </div>
              <div>
                <label className="ui-form-label">Phone</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={instructorForm.phone}
                  onChange={(event) => setInstructorForm((current) => ({ ...current, phone: event.target.value }))}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Department</label>
                <input
                  type="text"
                  value={selectedDepartment?.name || ''}
                  disabled
                  className="ui-form-input cursor-not-allowed opacity-80"
                />
              </div>
              <div className="ui-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddInstructorModal(false)}
                  disabled={creatingInstructor}
                  className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingInstructor}
                  className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                >
                  {creatingInstructor ? 'Creating...' : 'Create Instructor'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAssignExistingInstructor} className="space-y-4">
              <div>
                <label className="ui-form-label">Find Instructor</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={existingInstructorState.search}
                    onChange={(event) => setExistingInstructorState((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search by name, email, or department"
                    className="ui-form-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void fetchAssignableInstructors(selectedDepartment, existingInstructorState.search)
                    }}
                    disabled={loadingAssignableInstructors}
                    className="rounded-lg border border-[var(--color-card-border)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div>
                <label className="ui-form-label">Assign to {selectedDepartment?.name}</label>
                {loadingAssignableInstructors ? (
                  <LoadingSkeleton rows={3} itemClassName="h-16" />
                ) : assignableInstructors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                    No matching instructors available. Try searching by name or email.
                  </div>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3">
                    {assignableInstructors.map((staff) => {
                      const checked = existingInstructorState.selectedId === staff.id
                      const instructorDepartments = getInstructorDepartments(staff.instructor)

                      return (
                        <label key={staff.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition ${checked ? 'border-primary bg-primary-50' : 'border-transparent bg-[var(--color-card-surface)]'}`}>
                          <input
                            type="radio"
                            name="existingInstructor"
                            checked={checked}
                            onChange={() => setExistingInstructorState((current) => ({ ...current, selectedId: staff.id }))}
                            className="mt-1 h-4 w-4 accent-[var(--color-role-accent)]"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--color-heading)]">{staff.name}</p>
                            <p className="mt-1 text-[var(--color-text-muted)]">{staff.email}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              Current departments: {instructorDepartments.join(', ') || 'Not assigned'}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="ui-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddInstructorModal(false)}
                  disabled={assigningInstructor}
                  className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningInstructor || !existingInstructorState.selectedId}
                  className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                >
                  {assigningInstructor ? 'Assigning...' : 'Assign Instructor'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {showSectionModal && (
        <Modal
          title={`Manage Sections · ${selectedDepartment?.name || 'Department'}`}
          onClose={() => {
            if (!creatingSection && !deletingSectionId) {
              setShowSectionModal(false)
              setSectionForm(emptySectionForm)
              setSelectedDepartmentSections([])
              setInstructorError('')
            }
          }}
        >
          <Alert type="error" message={instructorError} />

          <form onSubmit={handleCreateSection} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-form-label">Semester</label>
                <select
                  value={sectionForm.semester}
                  onChange={(event) => setSectionForm((current) => ({ ...current, semester: event.target.value }))}
                  className="ui-form-input"
                >
                  {Array.from({ length: 8 }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      Semester {index + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ui-form-label">Section Name</label>
                <input
                  type="text"
                  value={sectionForm.section}
                  onChange={(event) => setSectionForm((current) => ({ ...current, section: event.target.value.toUpperCase() }))}
                  className="ui-form-input"
                  placeholder="e.g. A"
                  required
                />
              </div>
            </div>

            <div className="ui-modal-footer">
              <button
                type="button"
                onClick={() => setShowSectionModal(false)}
                className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                disabled={creatingSection}
              >
                Close
              </button>
              <button
                type="submit"
                className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                disabled={creatingSection}
              >
                {creatingSection ? 'Adding...' : 'Add Section'}
              </button>
            </div>
          </form>

          <div className="mt-4">
            <p className="text-sm font-semibold text-[var(--color-heading)]">Configured Sections</p>
            {loadingSections ? (
              <LoadingSkeleton rows={3} itemClassName="h-14" />
            ) : selectedDepartmentSections.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                No sections added yet for this department.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {selectedDepartmentSections.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-heading)]">Section {entry.section}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Semester {entry.semester}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteSection(entry.id)
                      }}
                      className="status-absent inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                      disabled={deletingSectionId === entry.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{deletingSectionId === entry.id ? 'Removing...' : 'Remove'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!departmentToDelete}
        title="Delete Department"
        message={departmentToDelete
          ? `Delete ${departmentToDelete.name}? This only works when no users or subjects still depend on it.`
          : ''}
        confirmText="Delete Department"
        busy={deletingDepartment}
        onClose={() => setDepartmentToDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default Departments


