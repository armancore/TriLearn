import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpCircle, FileSpreadsheet, PencilLine, Power, Trash2, Upload, UserPlus } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import useForm from '../../hooks/useForm'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
const initialUserValues = {
  name: '',
  email: '',
  password: '',
  studentId: '',
  phone: '',
  department: '',
  departments: [],
  semester: '1',
  section: ''
}

const allVisibleRoles = ['', 'ADMIN', 'COORDINATOR', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']
const coordinatorVisibleRoles = ['', 'GATEKEEPER', 'INSTRUCTOR', 'STUDENT']
const semesterFilterOptions = [
  { value: '', label: 'All semesters' },
  ...Array.from({ length: 8 }, (_, index) => ({
    value: String(index + 1),
    label: `Semester ${index + 1}`
  })),
  { value: 'graduate', label: 'Graduates' }
]
const academicSemesterOptions = Array.from({ length: 8 }, (_, index) => String(index + 1))
const getInstructorDepartments = (instructor) => (
  Array.isArray(instructor?.departments) && instructor.departments.length > 0
    ? instructor.departments
    : [instructor?.department].filter(Boolean)
)
const getStudentDetails = (student) => {
  if (!student) {
    return ''
  }

  const academicLabel = student.isGraduated
    ? `Graduate${student.graduationYear ? ` ${student.graduationYear}` : ''}`
    : `Sem ${student.semester}`

  return `${academicLabel} · ${student.rollNumber}`
}

const Users = () => {
  const { user: currentUser } = useAuth()
  const { departments, loadDepartments } = useReferenceData()
  const isCoordinator = currentUser?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('instructor')
  const [userToDelete, setUserToDelete] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importingStudents, setImportingStudents] = useState(false)
  const [promotingStudent, setPromotingStudent] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [studentToPromote, setStudentToPromote] = useState(null)
  const [studentToManageSection, setStudentToManageSection] = useState(null)
  const [studentSectionForm, setStudentSectionForm] = useState({ department: '', semester: '1', section: '' })
  const [updatingStudentSection, setUpdatingStudentSection] = useState(false)
  const [studentSectionError, setStudentSectionError] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [bulkSectionForm, setBulkSectionForm] = useState({ department: '', semester: '1', section: '' })
  const [bulkAssigningSection, setBulkAssigningSection] = useState(false)
  const [error, setError] = useState('')
  const { showToast } = useToast()
  const [filterRole, setFilterRole] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)
  const visibleRoles = isCoordinator ? coordinatorVisibleRoles : allVisibleRoles
  const departmentSectionMap = useMemo(() => (
    departments.reduce((acc, department) => {
      const semesterMap = {}
      ;(department.semesterSections || []).forEach((entry) => {
        semesterMap[String(entry.semester)] = Array.isArray(entry.sections) ? entry.sections : []
      })

      acc[department.name] = semesterMap
      return acc
    }, {})
  ), [departments])

  const getSectionOptions = useCallback((departmentName, semester) => (
    departmentSectionMap[departmentName]?.[String(semester)] || []
  ), [departmentSectionMap])

  const studentsOnPage = useMemo(() => (
    users.filter((user) => Boolean(user.student))
  ), [users])
  const validateUserForm = (values) => {
    const validationErrors = {}

    if (!values.name.trim()) validationErrors.name = 'Name is required'
    if (modalType === 'student') {
      if (!values.email.trim()) validationErrors.email = 'Personal email is required'
      else if (!/\S+@\S+\.\S+/.test(values.email)) validationErrors.email = 'Enter a valid personal email address'
      if (!values.studentId.trim()) validationErrors.studentId = 'Student ID is required'
    } else {
      if (!values.email.trim()) validationErrors.email = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(values.email)) validationErrors.email = 'Enter a valid email address'
      if (!values.password) validationErrors.password = 'Password is required'
      else if (values.password.length < 8) validationErrors.password = 'Password must be at least 8 characters'
      else if (!/[A-Z]/.test(values.password)) validationErrors.password = 'Password must include at least one uppercase letter'
      else if (!/[a-z]/.test(values.password)) validationErrors.password = 'Password must include at least one lowercase letter'
      else if (!/[0-9]/.test(values.password)) validationErrors.password = 'Password must include at least one number'
    }

    if (modalType === 'instructor' && (!Array.isArray(values.departments) || values.departments.length === 0)) {
      validationErrors.department = 'Select at least one department'
    } else if (modalType !== 'gatekeeper' && modalType !== 'instructor' && !values.department.trim()) {
      validationErrors.department = 'Department is required'
    }

    if (modalType === 'student') {
      const semester = parseInt(values.semester, 10)
      if (Number.isNaN(semester) || semester < 1 || semester > 8) {
        validationErrors.semester = 'Semester must be between 1 and 8'
      }
      const sectionOptions = getSectionOptions(values.department, values.semester)
      if (sectionOptions.length === 0) {
        validationErrors.section = 'Create a section for this department and semester in Departments first.'
      } else if (!values.section.trim()) {
        validationErrors.section = 'Section is required'
      } else if (!sectionOptions.includes(values.section.trim().toUpperCase())) {
        validationErrors.section = 'Select a valid configured section.'
      }
    }

    return validationErrors
  }
  const { values, errors, handleChange, handleSubmit, setValues, setErrors } = useForm(initialUserValues, validateUserForm)

  const handleInstructorDepartmentToggle = (departmentName) => {
    setValues((current) => {
      const selectedDepartments = Array.isArray(current.departments) ? current.departments : []
      const nextDepartments = selectedDepartments.includes(departmentName)
        ? selectedDepartments.filter((item) => item !== departmentName)
        : [...selectedDepartments, departmentName]

      return {
        ...current,
        departments: nextDepartments
      }
    })

    if (errors.department) {
      setErrors((current) => ({ ...current, department: '' }))
    }
  }

  useEffect(() => {
    setPage(1)
  }, [filterRole, semesterFilter, debouncedSearchTerm])

  useEffect(() => {
    if (filterRole && filterRole !== 'STUDENT' && semesterFilter) {
      setSemesterFilter('')
    }
  }, [filterRole, semesterFilter])

  useEffect(() => {
    void loadDepartments().catch((fetchError) => {
      logger.error('Failed to load departments', fetchError)
    })
  }, [loadDepartments])

  useEffect(() => {
    if (modalType !== 'student') {
      return
    }

    const sectionOptions = getSectionOptions(values.department, values.semester)
    if (sectionOptions.length === 0) {
      if (values.section) {
        setValues((current) => ({ ...current, section: '' }))
      }
      return
    }

    if (!sectionOptions.includes(values.section)) {
      setValues((current) => ({ ...current, section: sectionOptions[0] }))
    }
  }, [getSectionOptions, modalType, setValues, values.department, values.section, values.semester])

  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((id) => studentsOnPage.some((student) => student.id === id)))
  }, [studentsOnPage])

  useEffect(() => {
    if (bulkSectionForm.department) {
      return
    }

    const firstDepartment = departments[0]?.name || ''
    if (!firstDepartment) {
      return
    }

    const initialSectionOptions = getSectionOptions(firstDepartment, bulkSectionForm.semester)
    setBulkSectionForm((current) => ({
      ...current,
      department: firstDepartment,
      section: initialSectionOptions[0] || ''
    }))
  }, [bulkSectionForm.department, bulkSectionForm.semester, departments, getSectionOptions])

  const fetchUsers = useCallback(async (signal) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      })

      if (filterRole) {
        params.set('role', filterRole)
      }
      if (semesterFilter === 'graduate') {
        params.set('graduated', 'true')
      } else if (semesterFilter) {
        params.set('semester', semesterFilter)
        params.set('graduated', 'false')
      }
      if (debouncedSearchTerm.trim()) {
        params.set('search', debouncedSearchTerm.trim())
      }

      const res = await api.get(`/admin/users?${params.toString()}`, { signal })
      setUsers(res.data.users)
      setTotal(res.data.total)
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error(error)
      setError(getFriendlyErrorMessage(error, 'Unable to load users right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [debouncedSearchTerm, filterRole, limit, page, semesterFilter])

  useEffect(() => {
    const controller = new AbortController()
    void fetchUsers(controller.signal)
    return () => controller.abort()
  }, [fetchUsers])

  const handleCreateUser = async () => {
    setError('')
    try {
      const endpoint = modalType === 'coordinator'
        ? '/admin/users/coordinator'
        : modalType === 'instructor'
          ? '/admin/users/instructor'
          : modalType === 'gatekeeper'
            ? '/admin/users/gatekeeper'
            : '/admin/users/student'
      const payload = modalType === 'student'
        ? {
            name: values.name,
            email: values.email,
            studentId: values.studentId,
            phone: values.phone,
            address: '',
            department: values.department,
            semester: parseInt(values.semester, 10),
            section: values.section
          }
        : {
            name: values.name,
            email: values.email,
            password: values.password,
            phone: values.phone,
            address: '',
            department: modalType === 'gatekeeper'
              ? undefined
              : modalType === 'instructor'
                ? undefined
                : values.department,
            departments: modalType === 'instructor' ? values.departments : undefined
          }
      const res = await api.post(endpoint, {
        ...payload
      })
      if (modalType === 'student') {
        const loginEmail = res.data.user?.email
        showToast({
          title: 'Student account created.',
          description: res.data.welcomeEmailSent
            ? `Login email: ${loginEmail}. Temporary login instructions were sent by email.`
            : `Login email: ${loginEmail}. The account was created, but the welcome email could not be delivered.`
        })
      } else {
        showToast({ title: `${modalType} created successfully.` })
      }
      setFilterRole(modalType === 'student' ? 'STUDENT' : modalType === 'instructor' ? 'INSTRUCTOR' : modalType === 'gatekeeper' ? 'GATEKEEPER' : '')
      setSearchTerm('')
      setPage(1)
      setShowModal(false)
      setValues({
        ...initialUserValues
      })
      setErrors({})
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to create the user right now.'))
    }
  }

  const handleToggleStatus = async (id, currentStatus) => {
    const previousUsers = users
    const nextStatus = !currentStatus
    try {
      setUsers((current) => current.map((user) => (
        user.id === id ? { ...user, isActive: nextStatus } : user
      )))
      await api.patch(`/admin/users/${id}/toggle-status`)
      showToast({ title: `User ${nextStatus ? 'enabled' : 'disabled'} successfully.` })
    } catch (err) {
      setUsers(previousUsers)
      setError(getFriendlyErrorMessage(err, 'Unable to update the user right now.'))
    }
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    const previousUsers = users
    const previousTotal = total
    try {
      setDeletingUser(true)
      const target = userToDelete
      setUserToDelete(null)
      setUsers((current) => current.filter((user) => user.id !== target.id))
      setTotal((current) => Math.max(0, current - 1))
      await api.delete(`/admin/users/${target.id}`)
      showToast({ title: 'User deleted successfully.' })
    } catch (err) {
      setUsers(previousUsers)
      setTotal(previousTotal)
      setError(getFriendlyErrorMessage(err, 'Unable to delete the user right now.'))
    } finally {
      setDeletingUser(false)
    }
  }

  const handlePromoteSemester = async () => {
    if (!studentToPromote?.student) return

    const target = studentToPromote
    const previousUsers = users
    const isGraduationAction = Number(target.student.semester) >= 8

    try {
      setPromotingStudent(true)
      setStudentToPromote(null)
      const response = await api.patch(`/admin/users/${target.id}/promote-semester`)
      const updatedStudent = response.data.student
      setUsers((current) => current.map((entry) => (
        entry.id === target.id
          ? {
              ...entry,
              student: {
                ...entry.student,
                ...updatedStudent
              }
            }
          : entry
      )))
      showToast({
        title: isGraduationAction ? 'Student marked as graduated.' : 'Student promoted successfully.',
        description: isGraduationAction
          ? `${target.name} graduated in ${updatedStudent?.graduationYear || new Date().getFullYear()}.`
          : `${target.name} is now in semester ${updatedStudent?.semester}.`
      })
    } catch (err) {
      setUsers(previousUsers)
      setError(getFriendlyErrorMessage(err, 'Unable to promote the student right now.'))
    } finally {
      setPromotingStudent(false)
    }
  }

  const openStudentSectionModal = (studentUser) => {
    const currentDepartment = studentUser?.student?.department || ''
    const currentSemester = String(studentUser?.student?.semester || '1')
    const sectionOptions = getSectionOptions(currentDepartment, currentSemester)
    const currentSection = String(studentUser?.student?.section || '').toUpperCase()

    setStudentSectionForm({
      department: currentDepartment,
      semester: currentSemester,
      section: sectionOptions.includes(currentSection) ? currentSection : sectionOptions[0] || ''
    })
    setStudentSectionError('')
    setStudentToManageSection(studentUser)
  }

  const handleUpdateStudentSection = async (event) => {
    event.preventDefault()
    if (!studentToManageSection?.id) {
      return
    }

    const sectionOptions = getSectionOptions(studentSectionForm.department, studentSectionForm.semester)
    if (sectionOptions.length === 0) {
      setStudentSectionError('No section is configured for this department and semester yet.')
      return
    }

    if (!studentSectionForm.section || !sectionOptions.includes(studentSectionForm.section)) {
      setStudentSectionError('Select a valid section.')
      return
    }

    try {
      setUpdatingStudentSection(true)
      setStudentSectionError('')
      await api.put(`/admin/users/${studentToManageSection.id}`, {
        department: studentSectionForm.department,
        semester: Number(studentSectionForm.semester),
        section: studentSectionForm.section
      })

      setUsers((current) => current.map((entry) => (
        entry.id === studentToManageSection.id
          ? {
              ...entry,
              student: {
                ...entry.student,
                department: studentSectionForm.department,
                semester: Number(studentSectionForm.semester),
                section: studentSectionForm.section
              }
            }
          : entry
      )))

      showToast({
        title: 'Student section updated.',
        description: `${studentToManageSection.name} is now in semester ${studentSectionForm.semester}, section ${studentSectionForm.section}.`
      })
      setStudentToManageSection(null)
    } catch (requestError) {
      setStudentSectionError(getFriendlyErrorMessage(requestError, 'Unable to update student section right now.'))
    } finally {
      setUpdatingStudentSection(false)
    }
  }

  const openModal = (type) => {
    setModalType(type)
    setError('')
    setValues({
      ...initialUserValues
    })
    setErrors({})
    setShowModal(true)
  }

  const openImportModal = () => {
    setError('')
    setImportFile(null)
    setImportResult(null)
    setShowImportModal(true)
  }

  const handleImportStudents = async () => {
    if (!importFile) {
      setError('Please choose a CSV or XLSX file to import.')
      return
    }

    const formData = new FormData()
    formData.append('file', importFile)

    try {
      setImportingStudents(true)
      setError('')
      const response = await api.post('/admin/users/student-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setImportResult(response.data)
      await fetchUsers()
      showToast({
        title: 'Student import completed.',
        description: `${response.data.summary?.created || 0} students created, ${response.data.summary?.failed || 0} rows failed.`,
        type: 'success',
        duration: 5000
      })
    } catch (requestError) {
      setImportResult(requestError?.response?.data || null)
      setError(getFriendlyErrorMessage(requestError, 'Unable to import students right now.'))
    } finally {
      setImportingStudents(false)
    }
  }

  const canToggleStatus = (targetUser) => {
    if (!targetUser || targetUser.id === currentUser?.id) {
      return false
    }

    if (!isCoordinator) {
      return true
    }

    return true
  }

  const handleToggleStudentSelection = (userId) => {
    setSelectedStudentIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ))
  }

  const handleToggleAllStudentsOnPage = () => {
    const studentIdsOnPage = studentsOnPage.map((student) => student.id)
    const allSelected = studentIdsOnPage.length > 0 && studentIdsOnPage.every((id) => selectedStudentIds.includes(id))

    setSelectedStudentIds((current) => (
      allSelected
        ? current.filter((id) => !studentIdsOnPage.includes(id))
        : [...new Set([...current, ...studentIdsOnPage])]
    ))
  }

  const handleBulkAssignStudentSection = async () => {
    if (selectedStudentIds.length === 0) {
      setError('Select at least one student to update section.')
      return
    }

    const availableSections = getSectionOptions(bulkSectionForm.department, bulkSectionForm.semester)
    if (availableSections.length === 0) {
      setError('No sections are configured for the selected department and semester.')
      return
    }

    if (!bulkSectionForm.section || !availableSections.includes(bulkSectionForm.section)) {
      setError('Select a valid section for bulk update.')
      return
    }

    try {
      setBulkAssigningSection(true)
      setError('')
      await api.patch('/admin/users/students/assign-section', {
        userIds: selectedStudentIds,
        department: bulkSectionForm.department,
        semester: Number(bulkSectionForm.semester),
        section: bulkSectionForm.section
      })

      setUsers((current) => current.map((entry) => (
        selectedStudentIds.includes(entry.id) && entry.student
          ? {
              ...entry,
              student: {
                ...entry.student,
                department: bulkSectionForm.department,
                semester: Number(bulkSectionForm.semester),
                section: bulkSectionForm.section
              }
            }
          : entry
      )))
      showToast({
        title: 'Student sections updated.',
        description: `Moved ${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? '' : 's'} to semester ${bulkSectionForm.semester}, section ${bulkSectionForm.section}.`
      })
      setSelectedStudentIds([])
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to bulk update student sections right now.'))
    } finally {
      setBulkAssigningSection(false)
    }
  }

  return (
    <Layout>
      <div className="admin-page p-4 md:p-8">

        <PageHeader
          title="Users"
          subtitle={isCoordinator ? 'Manage users across the campus with admin-style access.' : 'Manage all users in TriLearn'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Users']}
          actions={[
            ...(isCoordinator
              ? [
                  { label: 'Add Instructor', icon: UserPlus, variant: 'primary', onClick: () => openModal('instructor') },
                  { label: 'Add Gate Account', icon: UserPlus, variant: 'primary', onClick: () => openModal('gatekeeper') },
                  { label: 'Import Students', icon: Upload, variant: 'secondary', onClick: openImportModal }
                ]
              : [
                  { label: 'Add Coordinator', icon: UserPlus, variant: 'primary', onClick: () => openModal('coordinator') },
                  { label: 'Add Instructor', icon: UserPlus, variant: 'primary', onClick: () => openModal('instructor') },
                  { label: 'Add Gate Account', icon: UserPlus, variant: 'primary', onClick: () => openModal('gatekeeper') },
                  { label: 'Import Students', icon: Upload, variant: 'secondary', onClick: openImportModal }
                ]),
            { label: 'Add Student', icon: UserPlus, variant: 'primary', onClick: () => openModal('student') }
          ]}
        />

        {/* Success/Error messages */}
        <Alert type="error" message={error} />

        {/* Filter */}
        <div className="mb-6 space-y-4">
          {!isCoordinator ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-heading)]">Bulk student import</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">Upload a CSV or XLSX file with `name`, `email`, `studentId`, `department`, `semester`, and `section`. `phone` and `address` are optional.</p>
                </div>
                <button
                  type="button"
                  onClick={openImportModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--color-heading)] transition hover:bg-[var(--color-surface-subtle)]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Upload roster</span>
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
            <label className="mb-2 block text-sm font-medium text-[var(--color-page-text)]">Search users</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, phone, roll number, or department"
              className="w-full rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm text-[var(--color-page-text)] focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {(filterRole === '' || filterRole === 'STUDENT') && (
            <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
              <label className="mb-2 block text-sm font-medium text-[var(--color-page-text)]">Filter students by semester</label>
              <select
                value={semesterFilter}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setSemesterFilter(nextValue)
                  if (nextValue && filterRole !== 'STUDENT') {
                    setFilterRole('STUDENT')
                  }
                }}
                className="w-full rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm text-[var(--color-page-text)] focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {semesterFilterOptions.map((option) => (
                  <option key={option.value || 'all-semesters'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {visibleRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setFilterRole(role)
                  if (role && role !== 'STUDENT') {
                    setSemesterFilter('')
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition
                  ${filterRole === role
                    ? 'bg-primary text-white'
                    : 'border border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
                  }`}
              >
                {role || 'All'}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-heading)]">Bulk Section Assignment</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Select students in the table and move them together to one section.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="ui-form-label">Department</label>
                  <select
                    value={bulkSectionForm.department}
                    onChange={(event) => {
                      const nextDepartment = event.target.value
                      const nextSections = getSectionOptions(nextDepartment, bulkSectionForm.semester)
                      setBulkSectionForm((current) => ({
                        ...current,
                        department: nextDepartment,
                        section: nextSections[0] || ''
                      }))
                    }}
                    className="ui-form-input"
                  >
                    <option value="">Select Department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">Semester</label>
                  <select
                    value={bulkSectionForm.semester}
                    onChange={(event) => {
                      const nextSemester = event.target.value
                      const nextSections = getSectionOptions(bulkSectionForm.department, nextSemester)
                      setBulkSectionForm((current) => ({
                        ...current,
                        semester: nextSemester,
                        section: nextSections[0] || ''
                      }))
                    }}
                    className="ui-form-input"
                  >
                    {academicSemesterOptions.map((semesterOption) => (
                      <option key={semesterOption} value={semesterOption}>
                        Semester {semesterOption}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ui-form-label">Section</label>
                  <select
                    value={bulkSectionForm.section}
                    onChange={(event) => setBulkSectionForm((current) => ({ ...current, section: event.target.value }))}
                    className="ui-form-input"
                    disabled={getSectionOptions(bulkSectionForm.department, bulkSectionForm.semester).length === 0}
                  >
                    {getSectionOptions(bulkSectionForm.department, bulkSectionForm.semester).length === 0 ? (
                      <option value="">No configured sections</option>
                    ) : (
                      getSectionOptions(bulkSectionForm.department, bulkSectionForm.semester).map((sectionOption) => (
                        <option key={sectionOption} value={sectionOption}>
                          {sectionOption}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      void handleBulkAssignStudentSection()
                    }}
                    disabled={bulkAssigningSection || selectedStudentIds.length === 0}
                    className="ui-role-fill w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bulkAssigningSection ? 'Updating...' : `Move ${selectedStudentIds.length} Student${selectedStudentIds.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden rounded-2xl bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/50">
          {loading ? (
            <div className="p-6">
              <LoadingSkeleton rows={6} itemClassName="h-16" />
            </div>
          ) : (
            <>
              {users.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={UserPlus}
                    title="No users found"
                    description={filterRole === 'INSTRUCTOR'
                      ? 'No instructors matched this filter yet. Create one to get started.'
                      : filterRole === 'COORDINATOR'
                        ? 'No coordinators matched this filter yet.'
                      : filterRole === 'STUDENT'
                        ? 'No students matched this filter yet. Add a student or change the filter.'
                        : 'Try a different role filter or create a new account for your campus.'}
                    action={(
                      <button
                        type="button"
                        onClick={() => openModal(filterRole === 'INSTRUCTOR' ? 'instructor' : 'student')}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-4 py-2 text-sm font-medium text-white"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>{filterRole === 'INSTRUCTOR' ? 'Add Instructor' : 'Add Student'}</span>
                      </button>
                    )}
                  />
                </div>
              ) : (
              <>
              <div className="flex items-center justify-between border-b border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Directory</h2>
                  <p className="text-sm text-[var(--color-text-muted)]">Manage account access, roles, and user status.</p>
                </div>
                <span className="ui-status-badge ui-status-neutral">{total} records</span>
              </div>
              <div className="overflow-x-auto max-h-[720px]">
              <table className="w-full min-w-[840px]">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface-muted)]">
                  <tr className="text-left text-sm text-[--color-text-muted] dark:text-slate-300">
                    <th scope="col" className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={studentsOnPage.length > 0 && studentsOnPage.every((student) => selectedStudentIds.includes(student.id))}
                        onChange={handleToggleAllStudentsOnPage}
                        className="h-4 w-4 accent-[var(--color-role-accent)]"
                        aria-label="Select all students on this page"
                      />
                    </th>
                    <th scope="col" className="px-6 py-4">Name</th>
                    <th scope="col" className="px-6 py-4">Email</th>
                    <th scope="col" className="px-6 py-4">Role</th>
                    <th scope="col" className="px-6 py-4">Details</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-[var(--color-card-border)] transition-colors hover:bg-primary-50/30 dark:hover:bg-primary-950/15">
                      <td className="px-4 py-4">
                        {user.student ? (
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(user.id)}
                            onChange={() => handleToggleStudentSelection(user.id)}
                            className="h-4 w-4 accent-[var(--color-role-accent)]"
                            aria-label={`Select ${user.name}`}
                          />
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[var(--color-heading)]">{user.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{user.phone || user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-[--color-text-muted] dark:text-slate-300 text-sm">{user.email}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={user.role} />
                      </td>
                      <td className="px-6 py-4 text-sm text-[--color-text-muted] dark:text-slate-300">
                        {user.student && getStudentDetails(user.student)}
                        {user.instructor && `${getInstructorDepartments(user.instructor).join(', ') || 'No dept'}`}
                        {user.coordinator && `${user.coordinator.department || 'No dept'} coordinator`}
                        {user.role === 'GATEKEEPER' && 'Gate QR operator'}
                        {user.admin && 'Administrator'}
                        {user.mustChangePassword && ' · Password reset pending'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={user.isActive ? 'ACTIVE' : 'DISABLED'} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {user.student ? (
                            <button
                              type="button"
                              onClick={() => openStudentSectionModal(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              aria-label={`Update ${user.name} section`}
                            >
                              <PencilLine className="h-4 w-4" />
                            </button>
                          ) : null}
                          {user.student && !user.student.isGraduated ? (
                            <button
                              type="button"
                              onClick={() => setStudentToPromote(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary transition hover:bg-primary-200 dark:bg-primary-900/35 dark:text-primary-200 dark:hover:bg-primary-900/50"
                              aria-label={Number(user.student.semester) >= 8
                                ? `Mark ${user.name} as graduated`
                                : `Promote ${user.name} to semester ${Number(user.student.semester) + 1}`}
                            >
                              <ArrowUpCircle className="h-4 w-4" />
                            </button>
                          ) : null}
                          {canToggleStatus(user) ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user.id, user.isActive)}
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition
                                ${user.isActive
                                  ? 'bg-accent-100 text-accent-700 hover:bg-accent-200 dark:bg-accent-900/35 dark:text-accent-200 dark:hover:bg-accent-900/50'
                                  : 'bg-primary-100 text-primary hover:bg-primary-200 dark:bg-primary-900/35 dark:text-primary-200 dark:hover:bg-primary-900/50'
                                }`}
                              aria-label={user.isActive ? `Disable ${user.name}` : `Enable ${user.name}`}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                          ) : null}
                          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR') && (
                            <button
                              type="button"
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700 transition hover:bg-accent-200 dark:bg-accent-900/35 dark:text-accent-200 dark:hover:bg-accent-900/50"
                              aria-label={`Delete ${user.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </>
              )}
              <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
            </>
          )}
        </div>

      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          title={`Add ${modalType === 'coordinator' ? 'Coordinator' : modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}`}
          onClose={() => setShowModal(false)}
        >
            <Alert type="error" message={error} />

            <form onSubmit={handleSubmit(handleCreateUser)} className="space-y-4">
              <div>
                <label className="ui-form-label">Full Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  value={values.name}
                  onChange={handleChange}
                  className={`ui-form-input ${errors.name ? 'ui-form-input-error' : ''}`}
                />
                {errors.name && <p className="ui-form-helper-error">{errors.name}</p>}
              </div>
              {modalType === 'student' ? (
                <>
                  <div>
                    <label className="ui-form-label">Student Personal Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      value={values.email}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="ui-form-label">Student ID / Roll Number</label>
                    <input
                      name="studentId"
                      type="text"
                      required
                      value={values.studentId}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.studentId ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.studentId && <p className="ui-form-helper-error">{errors.studentId}</p>}
                  </div>
                  <div className="rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary dark:bg-primary-950/30 dark:text-primary-300">
                    The student will sign in using their personal email address and will be forced to change the default password on first login.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="ui-form-label">Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      value={values.email}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="ui-form-label">Password</label>
                    <input
                      name="password"
                      type="password"
                      required
                      value={values.password}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.password ? 'ui-form-input-error' : ''}`}
                    />
                    {errors.password && <p className="ui-form-helper-error">{errors.password}</p>}
                  </div>
                  <p className="text-xs text-[--color-text-muted] dark:text-slate-300">
                    Use at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                </>
              )}
              <div>
                <label className="ui-form-label">Phone</label>
                <input
                  name="phone"
                  type="text"
                  placeholder="Optional"
                  value={values.phone}
                  onChange={handleChange}
                  className="ui-form-input"
                />
              </div>
              {modalType === 'instructor' ? (
                <div>
                  <label className="ui-form-label">Departments</label>
                  <div className="grid gap-2 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3 sm:grid-cols-2">
                    {departments.map((department) => {
                      const checked = values.departments.includes(department.name)

                      return (
                        <label key={department.id} className="flex items-center gap-3 rounded-lg bg-[var(--color-card-surface)] px-3 py-2 text-sm text-[var(--color-heading)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleInstructorDepartmentToggle(department.name)}
                            className="h-4 w-4 accent-[var(--color-role-accent)]"
                          />
                          <span>{department.name} ({department.code})</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-soft)]">Select every department this instructor teaches, such as `BIT` and `BCS`.</p>
                  {errors.department && <p className="ui-form-helper-error">{errors.department}</p>}
                </div>
              ) : modalType !== 'gatekeeper' && (
                <div>
                  <label className="ui-form-label">Department</label>
                  <select
                    name="department"
                    value={values.department}
                    onChange={handleChange}
                    className={`ui-form-input ${errors.department ? 'ui-form-input-error' : ''}`}
                  >
                    <option value="">Select Department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                  </select>
                  {errors.department && <p className="ui-form-helper-error">{errors.department}</p>}
                </div>
              )}

              {modalType === 'student' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="ui-form-label">Semester</label>
                    <select
                      name="semester"
                      value={values.semester}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.semester ? 'ui-form-input-error' : ''}`}
                    >
                      {academicSemesterOptions.map((semesterOption) => (
                        <option key={semesterOption} value={semesterOption}>
                          Semester {semesterOption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="ui-form-label">Section</label>
                    <select
                      name="section"
                      value={values.section}
                      onChange={handleChange}
                      className={`ui-form-input ${errors.section ? 'ui-form-input-error' : ''}`}
                      disabled={getSectionOptions(values.department, values.semester).length === 0}
                    >
                      {getSectionOptions(values.department, values.semester).length === 0 ? (
                        <option value="">No sections configured</option>
                      ) : (
                        getSectionOptions(values.department, values.semester).map((sectionOption) => (
                          <option key={sectionOption} value={sectionOption}>
                            {sectionOption}
                          </option>
                        ))
                      )}
                    </select>
                    {getSectionOptions(values.department, values.semester).length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                        Create sections from Departments first for this semester.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
              {modalType === 'student' && errors.semester && <p className="ui-form-helper-error">{errors.semester}</p>}
              {modalType === 'student' && errors.section && <p className="ui-form-helper-error">{errors.section}</p>}

              <div className="ui-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-300 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary font-medium"
                >
                  Create {modalType === 'coordinator' ? 'Coordinator' : modalType === 'instructor' ? 'Instructor' : modalType === 'gatekeeper' ? 'Gate Account' : 'Student'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {showImportModal && (
        <Modal
          title="Import Students"
          onClose={() => {
            if (!importingStudents) {
              setShowImportModal(false)
            }
          }}
        >
          <Alert type="error" message={error} />

          <div className="space-y-4">
            <div className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
              Use a CSV or XLSX file with these columns: `name`, `email`, `studentId`, `department`, `semester`, `section`.
              Optional columns: `phone`, `address`. Department can match either the department name or code.
            </div>

            <label className="ui-form-file">
              <input
                type="file"
                accept=".csv,.xlsx"
                className="ui-form-file-input"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null
                  setImportFile(nextFile)
                  setImportResult(null)
                }}
              />
              <span>{importFile ? `${importFile.name} selected` : 'Choose a CSV or XLSX file'}</span>
            </label>

            {importResult?.summary ? (
              <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-soft)]">Processed</p>
                    <p className="mt-2 text-2xl font-black text-[var(--color-heading)]">{importResult.summary.processed || 0}</p>
                  </div>
                  <div className="rounded-xl bg-primary-50 px-4 py-3 dark:bg-primary-950/20">
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">Created</p>
                    <p className="mt-2 text-2xl font-black text-primary">{importResult.summary.created || 0}</p>
                  </div>
                  <div className="rounded-xl bg-accent-50 px-4 py-3 dark:bg-accent-950/20">
                    <p className="text-xs uppercase tracking-[0.2em] text-accent-700 dark:text-accent-300">Failed</p>
                    <p className="mt-2 text-2xl font-black text-accent-700 dark:text-accent-300">{importResult.summary.failed || 0}</p>
                  </div>
                </div>

                {Array.isArray(importResult.created) && importResult.created.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Created accounts</p>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[var(--color-surface-muted)] p-3">
                      {importResult.created.map((student) => (
                        <div key={`${student.rowNumber}-${student.studentId}`} className="rounded-lg bg-[var(--color-card-surface)] px-3 py-3 text-sm">
                          <p className="font-semibold text-[var(--color-heading)]">{student.name} · {student.studentId}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">{student.email}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">
                            Welcome email: <span className="font-medium text-[var(--color-heading)]">{student.welcomeEmailSent ? 'Sent' : 'Pending / failed'}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(importResult.failures) && importResult.failures.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Failed rows</p>
                    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[var(--color-surface-muted)] p-3">
                      {importResult.failures.map((failure) => (
                        <div key={`${failure.rowNumber}-${failure.studentId || failure.email || failure.message}`} className="rounded-lg bg-[var(--color-card-surface)] px-3 py-3 text-sm">
                          <p className="font-semibold text-[var(--color-heading)]">Row {failure.rowNumber}</p>
                          <p className="mt-1 text-[var(--color-text-muted)]">{failure.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="ui-modal-footer">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={importingStudents}
                className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-300 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900 disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleImportStudents()
                }}
                disabled={!importFile || importingStudents}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary font-medium disabled:opacity-60"
              >
                {importingStudents ? 'Importing...' : 'Import Students'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {studentToManageSection && (
        <Modal
          title={`Update Section · ${studentToManageSection.name}`}
          onClose={() => {
            if (!updatingStudentSection) {
              setStudentToManageSection(null)
              setStudentSectionError('')
            }
          }}
        >
          <Alert type="error" message={studentSectionError} />

          <form onSubmit={handleUpdateStudentSection} className="space-y-4">
            <div>
              <label className="ui-form-label">Department</label>
              <select
                value={studentSectionForm.department}
                onChange={(event) => {
                  const nextDepartment = event.target.value
                  const nextSectionOptions = getSectionOptions(nextDepartment, studentSectionForm.semester)
                  setStudentSectionForm((current) => ({
                    ...current,
                    department: nextDepartment,
                    section: nextSectionOptions[0] || ''
                  }))
                }}
                className="ui-form-input"
                required
              >
                <option value="">Select Department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-form-label">Semester</label>
                <select
                  value={studentSectionForm.semester}
                  onChange={(event) => {
                    const nextSemester = event.target.value
                    const nextSectionOptions = getSectionOptions(studentSectionForm.department, nextSemester)
                    setStudentSectionForm((current) => ({
                      ...current,
                      semester: nextSemester,
                      section: nextSectionOptions[0] || ''
                    }))
                  }}
                  className="ui-form-input"
                >
                  {academicSemesterOptions.map((semesterOption) => (
                    <option key={semesterOption} value={semesterOption}>
                      Semester {semesterOption}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="ui-form-label">Section</label>
                <select
                  value={studentSectionForm.section}
                  onChange={(event) => setStudentSectionForm((current) => ({ ...current, section: event.target.value }))}
                  className="ui-form-input"
                  disabled={getSectionOptions(studentSectionForm.department, studentSectionForm.semester).length === 0}
                >
                  {getSectionOptions(studentSectionForm.department, studentSectionForm.semester).length === 0 ? (
                    <option value="">No configured sections</option>
                  ) : (
                    getSectionOptions(studentSectionForm.department, studentSectionForm.semester).map((sectionOption) => (
                      <option key={sectionOption} value={sectionOption}>
                        {sectionOption}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {getSectionOptions(studentSectionForm.department, studentSectionForm.semester).length === 0 ? (
              <p className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
                No sections exist for this department and semester. Create one from Departments first.
              </p>
            ) : null}

            <div className="ui-modal-footer">
              <button
                type="button"
                onClick={() => setStudentToManageSection(null)}
                className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                disabled={updatingStudentSection}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                disabled={updatingStudentSection || getSectionOptions(studentSectionForm.department, studentSectionForm.semester).length === 0}
              >
                {updatingStudentSection ? 'Updating...' : 'Save Section'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!studentToPromote}
        title={Number(studentToPromote?.student?.semester || 0) >= 8 ? 'Mark as Graduate' : 'Promote Semester'}
        message={studentToPromote
          ? Number(studentToPromote.student?.semester || 0) >= 8
            ? `Mark ${studentToPromote.name} as graduated for ${new Date().getFullYear()}? Use this after semester 8 has been fully completed.`
            : `Move ${studentToPromote.name} from semester ${studentToPromote.student?.semester} to semester ${Number(studentToPromote.student?.semester || 0) + 1}? This should be used only after the current semester has ended.`
          : ''}
        confirmText={Number(studentToPromote?.student?.semester || 0) >= 8 ? 'Mark Graduate' : 'Promote Student'}
        tone="primary"
        busy={promotingStudent}
        onClose={() => setStudentToPromote(null)}
        onConfirm={handlePromoteSemester}
      />

      <ConfirmDialog
        open={!!userToDelete}
        title="Delete User"
        message={userToDelete
          ? `Delete ${userToDelete.name}? This action permanently removes the account and related profile data.`
          : ''}
        confirmText="Delete User"
        busy={deletingUser}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default Users



