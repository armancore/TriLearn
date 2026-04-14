import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, BookOpenText, CalendarClock, CheckCircle2, FileText, Hash, Sparkles } from 'lucide-react'
import StudentLayout from '../layouts/StudentLayout'
import LoadingSkeleton from '../components/LoadingSkeleton'
import PageHeader from '../components/PageHeader'
import Alert from '../components/Alert'
import EmptyState from '../components/EmptyState'
import api, { fetchFileBlob } from '../utils/api'
import { isRequestCanceled } from '../utils/http'
import logger from '../utils/logger'

const formatDate = (value, options = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(value).toLocaleDateString('en-US', options)

const Learnings = () => {
  const { subjectId } = useParams()
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [materials, setMaterials] = useState([])
  const [error, setError] = useState('')
  const [previewFile, setPreviewFile] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    const fetchLearnings = async () => {
      try {
        setLoading(true)
        setError('')

        const [subjectRes, assignmentsRes, materialsRes] = await Promise.all([
          api.get(`/subjects/${subjectId}`, { signal: controller.signal }),
          api.get('/assignments', { params: { subjectId }, signal: controller.signal }),
          api.get(`/materials/subject/${subjectId}`, { signal: controller.signal })
        ])

        if (controller.signal.aborted) return

        setSubject(subjectRes.data.subject || null)
        setAssignments(assignmentsRes.data.assignments || [])
        setMaterials(materialsRes.data.materials || [])
      } catch (requestError) {
        if (isRequestCanceled(requestError)) return
        logger.error('Failed to load student subject learnings', requestError)
        setError(requestError.response?.data?.message || 'Unable to load this subject right now.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchLearnings()

    return () => {
      controller.abort()
    }
  }, [subjectId])

  useEffect(() => {
    return () => {
      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }
    }
  }, [previewFile])

  const upcomingAssignments = useMemo(() => (
    [...assignments]
      .filter((assignment) => new Date(assignment.dueDate) >= new Date())
      .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
  ), [assignments])

  const stats = [
    { label: 'Assignments', value: assignments.length, help: 'Tasks published for this subject', icon: CheckCircle2, color: 'from-emerald-500 to-cyan-500' },
    { label: 'Study Materials', value: materials.length, help: 'Resources shared by your instructor', icon: BookOpenText, color: 'from-blue-500 to-indigo-500' },
    { label: 'Due Soon', value: upcomingAssignments.length, help: 'Upcoming deadlines to watch', icon: CalendarClock, color: 'from-amber-400 to-orange-500' },
    { label: 'Subject Code', value: subject?.code || '--', help: 'Current learning space', icon: Hash, color: 'from-violet-500 to-fuchsia-500' }
  ]

  const openPreview = async (title, fileUrl) => {
    if (!fileUrl) {
      setError('This file preview is unavailable because the file link is invalid.')
      return
    }

    try {
      const { blob } = await fetchFileBlob(fileUrl)
      const objectUrl = window.URL.createObjectURL(blob)

      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }

      setPreviewFile({ title, url: objectUrl, objectUrl, canEmbed: blob.type === 'application/pdf' })
    } catch (previewError) {
      logger.error('Failed to preview learning file', previewError)
      setError('Unable to open this file right now.')
    }
  }

  return (
    <StudentLayout>
      <div className="space-y-6 p-4 md:p-8">
        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-32" />
        ) : (
          <>
            <PageHeader
              title={subject?.name || 'Subject Learnings'}
              subtitle="See assignments, study materials, and upcoming items for this subject in one place."
              breadcrumbs={['Student', 'Subjects', subject?.code || 'Learnings']}
            />

            <Alert type="error" message={error} />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon

                return (
                  <div key={stat.label} className="rounded-2xl bg-[--color-bg-card] p-5 shadow-sm dark:shadow-slate-900/50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">{stat.label}</p>
                        <p className="mt-3 text-3xl font-black tracking-tight text-[var(--color-text)]">{stat.value}</p>
                        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{stat.help}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.color} text-white shadow-lg`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-6">
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-[--color-bg-card] p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/50"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        Subject Hub
                      </p>
                      <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                        {subject?.name || 'Subject Learnings'}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {subject?.description || 'This learning space keeps your subject resources and deadlines together so you can move quickly.'}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Semester</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">Semester {subject?.semester || '--'}</p>
                      </div>
                      <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Department</p>
                        <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{subject?.department || 'General'}</p>
                      </div>
                    </div>
                  </div>
                </motion.section>

                <section className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">Assignments</h3>
                      <p className="text-sm text-[var(--color-text-muted)]">All coursework and deadlines for this subject.</p>
                    </div>
                    <Link to="/student/assignments" className="text-sm font-medium text-[var(--color-role-accent)] hover:underline">
                      All assignments
                    </Link>
                  </div>

                  {assignments.length === 0 ? (
                    <EmptyState
                      icon="📝"
                      title="No assignments yet"
                      description="Assignments for this subject will appear here when your instructor publishes them."
                    />
                  ) : (
                    <div className="space-y-3">
                      {assignments.map((assignment) => (
                        <div key={assignment.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text)]">{assignment.title}</p>
                              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{assignment.description || 'No extra instructions added yet.'}</p>
                              <p className="mt-3 text-xs text-[var(--color-text-muted)]">Total marks: {assignment.totalMarks}</p>
                            </div>
                            <div className="flex flex-col items-start gap-2 lg:items-end">
                              <span className="rounded-full bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                                Due {formatDate(assignment.dueDate)}
                              </span>
                              {assignment.questionPdfUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openPreview(`${assignment.title} - Question PDF`, assignment.questionPdfUrl)}
                                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-role-accent)] hover:underline"
                                >
                                  Open question
                                  <ArrowUpRight className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-6">
                <motion.aside
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-[--color-bg-card] p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/50"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Study Materials</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Resources and reference files shared for this subject.</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    {materials.length === 0 ? (
                      <EmptyState
                        icon="📚"
                        title="No materials yet"
                        description="Study materials for this subject will appear here when they are uploaded."
                      />
                    ) : (
                      materials.map((material) => (
                        <div key={material.id} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{material.title}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Uploaded {formatDate(material.createdAt)}</p>
                              {material.description ? (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{material.description}</p>
                              ) : null}
                            </div>
                            <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                          </div>
                          <button
                            type="button"
                            onClick={() => openPreview(material.title, material.fileUrl)}
                            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-role-accent)] hover:underline"
                          >
                            Open material
                            <ArrowUpRight className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.aside>

                <section className="rounded-2xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-[var(--color-text)]">Soon Items</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">The next things you will likely need in this subject.</p>
                  </div>

                  <div className="space-y-3">
                    {upcomingAssignments.slice(0, 3).map((assignment) => (
                      <div key={assignment.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{assignment.title}</p>
                        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Due on {formatDate(assignment.dueDate)}</p>
                      </div>
                    ))}

                    {upcomingAssignments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                        <p className="text-sm font-semibold text-[var(--color-text)]">No upcoming deadlines</p>
                        <p className="mt-2 text-sm text-[var(--color-text-muted)]">You are currently caught up for this subject.</p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                      <p className="text-sm font-semibold text-[var(--color-text)]">More learning tools are on the way</p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                        This space is ready for upcoming additions like quizzes, announcements, and section-wise resources.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="ui-card flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-xl dark:shadow-slate-900/50">
            <div className="flex items-center justify-between border-b border-[var(--color-card-border)] px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[var(--color-role-accent)] hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (previewFile?.objectUrl) {
                      window.URL.revokeObjectURL(previewFile.objectUrl)
                    }
                    setPreviewFile(null)
                  }}
                  className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
                >
                  X
                </button>
              </div>
            </div>
            {previewFile.canEmbed ? (
              <iframe
                src={previewFile.url}
                title={previewFile.title}
                className="w-full flex-1"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">
                  This file can be opened in a new tab, but embedded preview is only available for PDFs stored in this app.
                </p>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-role-fill rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Open File
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default Learnings

