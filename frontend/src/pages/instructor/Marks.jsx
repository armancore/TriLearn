import { useCallback, useEffect, useState } from 'react'
import { Plus, UploadCloud } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import InstructorLayout from '../../layouts/InstructorLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import { useToast } from '../../components/Toast'
import { useReferenceData } from '../../context/ReferenceDataContext'
import { useAuth } from '../../context/AuthContext'
import logger from '../../utils/logger'
import { isRequestCanceled } from '../../utils/http'

const examTypes = ['INTERNAL', 'MIDTERM', 'FINAL', 'PREBOARD', 'PRACTICAL']

const examTypeLabels = {
  INTERNAL: 'Internal',
  MIDTERM: 'Mid-Term',
  FINAL: 'Final',
  PREBOARD: 'Preboard',
  PRACTICAL: 'Practical'
}

const Marks = () => {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const { subjects, loadSubjects } = useReferenceData()
  const [marks, setMarks] = useState([])
  const [students, setStudents] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || '')
  const [selectedExamType, setSelectedExamType] = useState(isCoordinator ? 'MIDTERM' : '')
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    unpublished: 0,
    byExamType: []
  })
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    subjectId: '',
    examType: 'MIDTERM',
    totalMarks: 100
  })
  const [draftMarks, setDraftMarks] = useState({})
  const [error, setError] = useState('')
  const { showToast } = useToast()

  const fetchStudents = useCallback(async (subjectId, signal) => {
    if (!subjectId) {
      setStudents([])
      return
    }

    try {
      const res = await api.get(`/marks/subject/${subjectId}/students`, { signal })
      setStudents(res.data.students)
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) return
      logger.error('Failed to load subject students', fetchError)
      setStudents([])
    }
  }, [])

  const fetchMarks = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')

      if (isCoordinator) {
        const res = await api.get('/marks/review', {
          signal,
          params: {
            page,
            limit,
            ...(selectedExamType ? { examType: selectedExamType } : {}),
            ...(selectedSubject ? { subjectId: selectedSubject } : {})
          }
        })
        setMarks(res.data.marks || [])
        setTotal(res.data.total || 0)
        setStats(res.data.stats || { total: 0, published: 0, unpublished: 0, byExamType: [] })
        return
      }

      if (!selectedSubject) {
        setMarks([])
        setTotal(0)
        setStats({ total: 0, published: 0, unpublished: 0, byExamType: [] })
        return
      }

      const res = await api.get(`/marks/subject/${selectedSubject}`, {
        signal,
        params: {
          page,
          limit,
          ...(selectedExamType ? { examType: selectedExamType } : {})
        }
      })
      setMarks(res.data.marks || [])
      setTotal(res.data.total || 0)
      setStats(res.data.stats || { total: 0, published: 0, unpublished: 0, byExamType: [] })
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) return
      logger.error('Failed to load marks', fetchError)
      setError(fetchError.response?.data?.message || 'Unable to load marks right now')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [isCoordinator, limit, page, selectedExamType, selectedSubject])

  useEffect(() => {
    void loadSubjects().catch((loadError) => {
      logger.error('Failed to load subjects', loadError)
    })
  }, [loadSubjects])

  useEffect(() => {
    const controller = new AbortController()
    void fetchMarks(controller.signal)
    return () => controller.abort()
  }, [fetchMarks])

  useEffect(() => {
    if (!showModal || isCoordinator) return

    const controller = new AbortController()
    if (form.subjectId) {
      void fetchStudents(form.subjectId, controller.signal)
    } else {
      setStudents([])
    }

    return () => controller.abort()
  }, [fetchStudents, form.subjectId, isCoordinator, showModal])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const entries = Object.entries(draftMarks)
        .map(([studentId, value]) => ({
          studentId,
          obtainedMarks: value?.obtainedMarks,
          remarks: value?.remarks || ''
        }))
        .filter((entry) => entry.obtainedMarks !== '' && entry.obtainedMarks !== undefined && entry.obtainedMarks !== null)

      if (!form.subjectId || !form.examType) {
        setError('Please select the exam type and module first')
        return
      }

      if (entries.length === 0) {
        setError('Enter marks for at least one student')
        return
      }

      await api.post('/marks/bulk', {
        subjectId: form.subjectId,
        examType: form.examType,
        totalMarks: parseInt(form.totalMarks, 10),
        entries: entries.map((entry) => ({
          studentId: entry.studentId,
          obtainedMarks: parseInt(entry.obtainedMarks, 10),
          remarks: entry.remarks
        }))
      })

      showToast({ title: `Exam marks added for ${entries.length} student${entries.length === 1 ? '' : 's'}.` })
      setShowModal(false)
      setForm({
        subjectId: selectedSubject || '',
        examType: selectedExamType || 'MIDTERM',
        totalMarks: 100
      })
      setDraftMarks({})
      await fetchMarks()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handlePublish = async () => {
    if (!selectedExamType) {
      setError('Please select the exam result type to publish')
      return
    }

    if (selectedExamType === 'PRACTICAL') {
      setError('Practical marks remain visible only to instructors and coordinators')
      return
    }

    try {
      setPublishing(true)
      setError('')
      const res = await api.post('/marks/publish', {
        examType: selectedExamType,
        ...(selectedSubject ? { subjectId: selectedSubject } : {})
      })
      showToast({ title: res.data.message })
      await fetchMarks()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to publish results right now')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">
        <PageHeader
          title={isCoordinator ? 'Exam Result Publishing' : 'Exam Marks'}
          subtitle={isCoordinator
            ? 'Publish Mid-Term, Final, or Preboard results for students. Practical marks stay internal for staff only.'
            : 'Add marks for your own module exams. Practical marks remain visible only to instructors and coordinators.'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Instructor', 'Exam Results']}
          actions={[
            ...(!isCoordinator ? [{
              label: 'Add Exam Mark',
              icon: Plus,
              variant: 'primary',
              onClick: () => {
                setShowModal(true)
                setError('')
                setForm((current) => ({
                  ...current,
                  subjectId: selectedSubject || current.subjectId,
                  examType: selectedExamType || current.examType
                }))
                setDraftMarks({})
              }
            }] : []),
            ...(isCoordinator ? [{
              label: publishing ? 'Publishing...' : `Publish ${examTypeLabels[selectedExamType] || 'Results'}`,
              icon: UploadCloud,
              variant: 'secondary',
              onClick: handlePublish,
              disabled: publishing || !selectedExamType || selectedExamType === 'PRACTICAL'
            }] : [])
          ]}
        />

        <Alert type="error" message={error} />

        <div className="mb-6 grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-[var(--color-text-muted)]">{isCoordinator ? 'Module Filter' : 'Module'}</label>
            <select
              value={selectedSubject}
              onChange={(event) => {
                setSelectedSubject(event.target.value)
                setPage(1)
              }}
              className="ui-form-input"
            >
              <option value="">{isCoordinator ? 'All Department Modules' : 'Select a module'}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} - {subject.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm text-[var(--color-text-muted)]">Exam Result Type</label>
            <select
              value={selectedExamType}
              onChange={(event) => {
                setSelectedExamType(event.target.value)
                setPage(1)
              }}
              className="ui-form-input"
            >
              <option value="">All Exam Types</option>
              {examTypes.map((examType) => (
                <option key={examType} value={examType}>
                  {examTypeLabels[examType]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Records</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-heading)]">{stats.total || total}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Published</p>
            <p className="status-present mt-1 inline-flex rounded-lg px-3 py-1 text-2xl font-bold">{stats.published || 0}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Unpublished</p>
            <p className="status-late mt-1 inline-flex rounded-lg px-3 py-1 text-2xl font-bold">{stats.unpublished || 0}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Practical Visibility</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-heading)]">Staff only</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Students never see practical marks</p>
          </div>
        </div>

        {stats.byExamType?.length > 0 && (
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-[var(--color-heading)]">Exam Result Publishing Status</p>
            <div className="grid gap-3 md:grid-cols-4">
              {stats.byExamType.map((item) => (
                <div key={item.examType} className="rounded-xl border border-[var(--color-card-border)] p-4">
                  <p className="text-sm font-semibold text-[var(--color-heading)]">{examTypeLabels[item.examType] || item.examType}</p>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">{item.count} records</p>
                  <p className="status-present mt-1 inline-flex rounded-lg px-2 py-1 text-xs">{item.published} published</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!isCoordinator && !selectedSubject) ? (
          <div className="rounded-2xl bg-white p-10 shadow-sm">
            <EmptyState
              icon="📝"
              title="Select a module first"
              description="Choose one of your modules to add or review exam marks."
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-6">
                <LoadingSkeleton rows={5} itemClassName="h-20" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--color-heading)]">
                      {isCoordinator ? 'Department Exam Result Review' : 'Module Exam Mark Ledger'}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {isCoordinator
                        ? 'Review marks by exam result type before publishing them for students.'
                        : 'Every mark stays internal until a coordinator publishes the matching exam result.'}
                    </p>
                  </div>
                  <span className="ui-status-badge ui-status-neutral">{total} records</span>
                </div>
                <div className="overflow-x-auto max-h-[720px]">
                  <table className="w-full min-w-[1100px]">
                    <thead className="sticky top-0 z-10 bg-[var(--color-surface-muted)]">
                      <tr className="text-left text-sm text-[var(--color-text-muted)]">
                        <th scope="col" className="px-6 py-4">Student</th>
                        <th scope="col" className="px-6 py-4">Module</th>
                        <th scope="col" className="px-6 py-4">Exam Type</th>
                        <th scope="col" className="px-6 py-4">Marks</th>
                        <th scope="col" className="px-6 py-4">Percentage</th>
                        <th scope="col" className="px-6 py-4">Grade</th>
                        <th scope="col" className="px-6 py-4">Publication</th>
                        <th scope="col" className="px-6 py-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marks.map((mark) => (
                        <tr key={mark.id} className="border-t border-[var(--color-card-border)] transition-colors hover:bg-[var(--color-surface-muted)]/70">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-[var(--color-heading)]">{mark.student?.user?.name}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{mark.student?.rollNumber || mark.student?.user?.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-medium text-[var(--color-heading)]">{mark.subject?.name}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{mark.subject?.code}</p>
                          </td>
                          <td className="px-6 py-4 text-[var(--color-text-muted)]">{examTypeLabels[mark.examType] || mark.examType}</td>
                          <td className="px-6 py-4 font-medium text-[var(--color-text-muted)]">{mark.obtainedMarks}/{mark.totalMarks}</td>
                          <td className="px-6 py-4 font-medium text-[var(--color-text-muted)]">{mark.percentage.toFixed(1)}%</td>
                          <td className="px-6 py-4 font-medium text-[var(--color-text-muted)]">{mark.grade}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              mark.isPublished ? 'status-present' : 'status-late'
                            }`}
                            >
                              {mark.isPublished ? 'Published' : 'Hidden'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">{mark.remarks || '-'}</td>
                        </tr>
                      ))}
                      {marks.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-10">
                            <EmptyState
                              icon="📝"
                              title="No exam marks found"
                              description={isCoordinator
                                ? 'No marks match the selected exam result filter yet.'
                                : 'Add the first exam record for this module to build the result ledger.'}
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
              </>
            )}
          </div>
        )}
      </div>

      {showModal && !isCoordinator && (
        <Modal title="Add Examination Mark" onClose={() => setShowModal(false)}>
          <Alert type="error" message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <select
              value={form.examType}
              onChange={(event) => {
                setForm({ ...form, examType: event.target.value })
                setDraftMarks({})
              }}
              className="ui-form-input"
            >
              {examTypes.map((examType) => (
                <option key={examType} value={examType}>
                  {examTypeLabels[examType]}
                </option>
              ))}
            </select>
            <select
              required
              value={form.subjectId}
              onChange={(event) => {
                setForm({ ...form, subjectId: event.target.value })
                setDraftMarks({})
              }}
              className="ui-form-input"
            >
              <option value="">Select Module</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Full Marks"
              required
              value={form.totalMarks}
              onChange={(event) => setForm({ ...form, totalMarks: event.target.value })}
              className="ui-form-input"
            />
            {form.subjectId ? (
              students.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-card-border)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No enrolled students found for this module.
                </div>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {students.map((student) => (
                    <div key={student.id} className="rounded-xl border border-[var(--color-card-border)] p-4">
                      <div className="mb-3">
                        <p className="font-semibold text-[var(--color-heading)]">{student.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {student.rollNumber} • Semester {student.semester}{student.section ? ` • Section ${student.section}` : ''}
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                        <input
                          type="number"
                          min="0"
                          max={form.totalMarks || undefined}
                          placeholder="Marks"
                          value={draftMarks[student.id]?.obtainedMarks ?? ''}
                          onChange={(event) => setDraftMarks((current) => ({
                            ...current,
                            [student.id]: {
                              ...current[student.id],
                              obtainedMarks: event.target.value
                            }
                          }))}
                          className="ui-form-input"
                        />
                        <input
                          type="text"
                          placeholder="Remarks (optional)"
                          value={draftMarks[student.id]?.remarks ?? ''}
                          onChange={(event) => setDraftMarks((current) => ({
                            ...current,
                            [student.id]: {
                              ...current[student.id],
                              remarks: event.target.value
                            }
                          }))}
                          className="ui-form-input"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
            <div className="status-late rounded-lg px-4 py-3 text-sm">
              {form.examType === 'PRACTICAL'
                ? 'Practical marks will remain visible only to instructors and coordinators.'
                : 'Students can only view this result after the coordinator publishes the matching exam result.'}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-[var(--color-card-border)] py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ui-role-fill flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Save Mark
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}

export default Marks
