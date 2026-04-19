import { useCallback, useEffect, useState } from 'react'
import { BookOpenText, ClipboardList, FileText, GraduationCap, LoaderCircle, Pencil, Plus, Trash2, Users } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import { useAuth } from '../../context/AuthContext'
import { useReferenceData } from '../../context/ReferenceDataContext'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
const Subjects = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : AdminLayout
  const { departments, loadDepartments } = useReferenceData()
  const [subjects, setSubjects] = useState([])
  const [instructors, setInstructors] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(12)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editSubject, setEditSubject] = useState(null)
  const [subjectToDelete, setSubjectToDelete] = useState(null)
  const [deletingSubject, setDeletingSubject] = useState(false)
  const [enrollmentSubject, setEnrollmentSubject] = useState(null)
  const [enrollmentStudents, setEnrollmentStudents] = useState([])
  const [loadingEnrollments, setLoadingEnrollments] = useState(false)
  const [savingEnrollments, setSavingEnrollments] = useState(false)
  const [enrollmentSearch, setEnrollmentSearch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [form, setForm] = useState({
    name: '', code: '', description: '',
    semester: 1, department: '', instructorId: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const debouncedEnrollmentSearch = useDebouncedValue(enrollmentSearch, 250)
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300)

  useEffect(() => {
    void loadDepartments().catch((error) => {
      logger.error('Failed to load departments', error)
    })
  }, [loadDepartments])

  const fetchSubjects = useCallback(async (signal) => {
    try {
      setLoading(true)
      const res = await api.get('/subjects', {
        signal,
        params: {
          page,
          limit,
          ...(debouncedSearchTerm.trim() ? { search: debouncedSearchTerm.trim() } : {})
        }
      })
      setSubjects(res.data.subjects || [])
      setTotal(res.data.total || 0)
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error('Failed to load subjects', error)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [debouncedSearchTerm, limit, page])

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
      setInstructors((res.data.users || []).filter((inst) => inst.instructor?.id))
    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error('Failed to load instructors', error)
    }
  }, [isCoordinator])

  useEffect(() => {
    const controller = new AbortController()
    void fetchInstructors(controller.signal)
    return () => controller.abort()
  }, [fetchInstructors])

  useEffect(() => {
    const controller = new AbortController()
    void fetchSubjects(controller.signal)
    return () => controller.abort()
  }, [fetchSubjects])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editSubject) {
        await api.put(`/subjects/${editSubject.id}`, form)
        setSuccess('Subject updated successfully!')
      } else {
        await api.post('/subjects', form)
        setSuccess('Subject created successfully!')
      }
      setShowModal(false)
      setEditSubject(null)
      setForm({ name: '', code: '', description: '', semester: 1, department: '', instructorId: '' })
      fetchSubjects()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to save the subject right now.'))
    }
  }

  const handleDelete = async () => {
    if (!subjectToDelete) return
    try {
      setDeletingSubject(true)
      const targetId = subjectToDelete.id
      setSubjectToDelete(null)
      await api.delete(`/subjects/${targetId}`)
      setSuccess('Subject deleted successfully!')
      await fetchSubjects()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to delete the subject right now.'))
    } finally {
      setDeletingSubject(false)
    }
  }

  const openEditModal = (subject) => {
    setEditSubject(subject)
    setForm({
      name: subject.name,
      code: subject.code,
      description: subject.description || '',
      semester: subject.semester,
      department: subject.department || '',
      instructorId: subject.instructorId || ''
    })
    setError('')
    setShowModal(true)
  }

  const openCreateModal = () => {
    setEditSubject(null)
    setForm({ name: '', code: '', description: '', semester: 1, department: '', instructorId: '' })
    setError('')
    setShowModal(true)
  }

  const openEnrollmentModal = async (subject) => {
    try {
      setLoadingEnrollments(true)
      setEnrollmentSubject(subject)
      setEnrollmentSearch('')
      setError('')
      const res = await api.get(`/subjects/${subject.id}/enrollments`)
      setEnrollmentStudents(res.data.students)
    } catch (err) {
      setEnrollmentSubject(null)
      setError(getFriendlyErrorMessage(err, 'Unable to load subject enrollments.'))
    } finally {
      setLoadingEnrollments(false)
    }
  }

  const toggleEnrollment = (studentId) => {
    setEnrollmentStudents((current) => current.map((student) => (
      student.id === studentId ? { ...student, enrolled: !student.enrolled } : student
    )))
  }

  const applySuggestedEnrollments = () => {
    setEnrollmentStudents((current) => current.map((student) => ({
      ...student,
      enrolled: student.suggested
    })))
  }

  const saveEnrollments = async () => {
    if (!enrollmentSubject) return

    try {
      setSavingEnrollments(true)
      setError('')
      await api.put(`/subjects/${enrollmentSubject.id}/enrollments`, {
        studentIds: enrollmentStudents.filter((student) => student.enrolled).map((student) => student.id)
      })
      setSuccess('Subject enrollments updated successfully!')
      setEnrollmentSubject(null)
      setEnrollmentStudents([])
      fetchSubjects()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to update enrollments right now.'))
    } finally {
      setSavingEnrollments(false)
    }
  }

  const filteredEnrollmentStudents = enrollmentStudents.filter((student) => {
    const keyword = debouncedEnrollmentSearch.trim().toLowerCase()
    if (!keyword) return true

    return [
      student.name,
      student.email,
      student.rollNumber,
      student.department || '',
      student.section || ''
    ].some((value) => value.toLowerCase().includes(keyword))
  })

  return (
    <Layout>
      <div className="admin-page p-8">

        <PageHeader
          title="Subjects"
          subtitle={isCoordinator ? 'Manage department subjects, instructor assignments, and student enrollments.' : 'Manage all subjects in TriLearn'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Admin', 'Subjects']}
          actions={[{ label: 'Add Subject', icon: Plus, variant: 'primary', onClick: openCreateModal }]}
        />

        {/* Success/Error */}
        {success && (
          <div className="mb-4 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary dark:bg-primary-950/30 dark:text-primary-300">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-600 dark:bg-accent-950/30 dark:text-accent-300">
            {error}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50">
          <label className="mb-2 block text-sm font-medium text-[var(--color-page-text)]">Search subjects</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setPage(1)
            }}
            placeholder="Search by subject name, code, department, description, or instructor"
            className="w-full rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm text-[var(--color-page-text)] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Subjects Grid */}
        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-44" />
        ) : (
          <>
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">Subject Catalog</h2>
              <p className="text-sm text-[var(--color-text-muted)]">All active subjects, instructors, and enrollment summaries.</p>
            </div>
            <span className="ui-status-badge ui-status-neutral">{total} records</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <div key={subject.id} className="rounded-2xl bg-[var(--color-card-surface)] p-6 shadow-sm transition hover:shadow-md dark:shadow-slate-900/50">

                {/* Subject header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="rounded bg-primary-50 px-2 py-1 text-xs font-bold text-primary dark:bg-primary-950/30 dark:text-primary-300">
                      {subject.code}
                    </span>
                    <h3 className="font-semibold text-[--color-text] dark:text-slate-100 mt-2">{subject.name}</h3>
                  </div>
                  <span className="rounded bg-[var(--color-surface-muted)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
                    Sem {subject.semester}
                  </span>
                </div>

                {/* Description */}
                {subject.description && (
                  <p className="text-sm text-[--color-text-muted] dark:text-slate-300 mb-4 line-clamp-2">{subject.description}</p>
                )}

                {/* Instructor */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-[var(--color-text-soft)]">Instructor:</span>
                  <span className="text-xs font-medium text-[var(--color-page-text)]">
                    {subject.instructor?.user?.name || 'Not assigned'}
                  </span>
                </div>

                {/* Stats */}
                <div className="mb-4 grid gap-2 text-xs text-[--color-text-muted] dark:text-slate-300">
                  <span className="inline-flex items-center gap-2"><FileText className="h-3.5 w-3.5" />{subject._count?.assignments} assignments</span>
                  <span className="inline-flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5" />{subject._count?.attendances} attendances</span>
                  <span className="inline-flex items-center gap-2"><Users className="h-3.5 w-3.5" />{subject._count?.enrollments || 0} students</span>
                </div>

                {/* Department */}
                {subject.department && (
                  <div className="mb-4">
                    <span className="rounded bg-primary-50 px-2 py-1 text-xs text-primary dark:bg-primary-950/30 dark:text-primary-300">
                      {subject.department}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 border-t border-[var(--color-card-border)] pt-4">
                  <button
                    onClick={() => openEditModal(subject)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary transition hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50"
                    aria-label={`Edit ${subject.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openEnrollmentModal(subject)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-50 py-2 text-xs font-medium text-primary transition hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50"
                  >
                    <Users className="h-4 w-4" />
                    <span>Students</span>
                  </button>
                  <button
                    onClick={() => setSubjectToDelete(subject)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 py-2 text-accent-600 transition hover:bg-accent-100 dark:bg-accent-950/30 dark:text-accent-300 dark:hover:bg-accent-950/50"
                    aria-label={`Delete ${subject.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

              </div>
            ))}

            {subjects.length === 0 && (
              <div className="col-span-3">
                <EmptyState
                  icon={BookOpenText}
                  title="No subjects yet"
                  description="Create your first subject and assign an instructor to start building the academic structure."
                  action={(
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"
                    >
                      Add Subject
                    </button>
                  )}
                />
              </div>
            )}
          </div>
          <div className="mt-6">
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </div>
          </>
        )}

      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editSubject ? 'Edit Subject' : 'Add Subject'} onClose={() => setShowModal(false)}>

            {error && (
              <div className="mb-4 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-600 dark:bg-accent-950/30 dark:text-accent-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-form-label">Subject Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ui-form-input"
                />
              </div>
              <div>
                <label className="ui-form-label">Subject Code</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="ui-form-input"
                  disabled={!!editSubject}
                />
              </div>
              <div>
                <label className="ui-form-label">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="ui-form-input"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="ui-form-label">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    required
                    value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: parseInt(e.target.value) })}
                    className="ui-form-input"
                  />
                </div>
                <div className="flex-1">
                  <label className="ui-form-label">Department</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
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
              </div>

              <div>
                <label className="ui-form-label">Instructor</label>
                <select
                  value={form.instructorId}
                  onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
                  className="ui-form-input"
                >
                  <option value="">Select Instructor (optional)</option>
                  {instructors.map((inst) => (
                    <option key={inst.instructor.id} value={inst.instructor.id}>
                      {inst.name} - {inst.instructor?.department || 'No dept'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ui-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary font-medium"
                >
                  {editSubject ? 'Update Subject' : 'Create Subject'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {enrollmentSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-[var(--color-card-surface)] p-8 shadow-xl dark:shadow-slate-900/50">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-heading)]">Manage Enrollments</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {enrollmentSubject.name} ({enrollmentSubject.code})
                </p>
              </div>
              <button
                onClick={() => setEnrollmentSubject(null)}
                className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
              >
                X
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <input
                type="text"
                value={enrollmentSearch}
                onChange={(e) => setEnrollmentSearch(e.target.value)}
                placeholder="Search students by name, roll, email, section..."
                className="flex-1 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-2 text-sm text-[var(--color-page-text)] focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={applySuggestedEnrollments}
                className="rounded-lg bg-primary-50 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-100 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-950/50"
              >
                Apply Suggested
              </button>
            </div>

            <p className="text-xs text-[--color-text-muted] dark:text-slate-300 mb-4">
              Suggested students match the subject&apos;s semester and department. You can adjust the final class list manually.
            </p>

            {loadingEnrollments ? (
              <div className="text-center text-[--color-text-muted] dark:text-slate-300 py-12">Loading students...</div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {filteredEnrollmentStudents.map((student) => (
                  <label key={student.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-card-border)] p-4 hover:bg-[var(--color-surface-muted)]">
                    <input
                      type="checkbox"
                      checked={student.enrolled}
                      onChange={() => toggleEnrollment(student.id)}
                      className="mt-1 h-4 w-4 rounded border-[var(--color-card-border)] text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[--color-text] dark:text-slate-100">{student.name}</p>
                          <p className="text-sm text-[--color-text-muted] dark:text-slate-300 mt-1">{student.rollNumber} • {student.email}</p>
                        </div>
                        {student.suggested && (
                          <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary dark:bg-primary-950/30 dark:text-primary-300">
                            Suggested
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-text-soft)]">
                        Semester {student.semester}{student.department ? ` • ${student.department}` : ''}{student.section ? ` • Section ${student.section}` : ''}
                      </p>
                    </div>
                  </label>
                ))}
                {filteredEnrollmentStudents.length === 0 && (
                  <EmptyState
                    icon={GraduationCap}
                    title="No students matched"
                    description="Try a different search term or apply the suggested enrollment list for this subject."
                  />
                )}
              </div>
            )}

            <div className="mt-4 flex gap-3 border-t border-[var(--color-card-border)] pt-6">
              <button
                type="button"
                onClick={() => setEnrollmentSubject(null)}
                className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEnrollments}
                disabled={savingEnrollments || loadingEnrollments}
                className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEnrollments ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </span>
                ) : 'Save Enrollments'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!subjectToDelete}
        title="Delete Subject"
        message={subjectToDelete
          ? `Delete ${subjectToDelete.name} (${subjectToDelete.code})? This removes the subject from active use.`
          : ''}
        confirmText="Delete Subject"
        busy={deletingSubject}
        onClose={() => setSubjectToDelete(null)}
        onConfirm={handleDelete}
      />

    </Layout>
  )
}

export default Subjects




