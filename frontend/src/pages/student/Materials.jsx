import { useCallback, useEffect, useRef, useState } from 'react'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StudentLayout from '../../layouts/StudentLayout'
import { useToast } from '../../components/Toast'
import api, { fetchFileBlob, openFileUrl } from '../../utils/api'
import Alert from '../../components/Alert'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const StudentMaterials = () => {
  const materialRequestRef = useRef(null)
  const subjectRequestRef = useRef(null)
  const [filterSubject, setFilterSubject] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [materials, setMaterials] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { showToast } = useToast()

  const fetchMaterials = useCallback(async () => {
    if (materialRequestRef.current) {
      materialRequestRef.current.abort()
    }

    const controller = new AbortController()
    materialRequestRef.current = controller

    try {
      const response = await api.get('/materials', {
        signal: controller.signal,
        params: { limit: 100 }
      })

      if (controller.signal.aborted) {
        return
      }

      setMaterials(response.data.materials || [])
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) {
        return
      }

      logger.error('Failed to load student materials', fetchError)
      setMaterials([])
      setError(fetchError.response?.data?.message || 'Unable to load study materials right now.')
      throw fetchError
    } finally {
      if (materialRequestRef.current === controller) {
        materialRequestRef.current = null
      }
    }
  }, [])

  const fetchSubjects = useCallback(async () => {
    if (subjectRequestRef.current) {
      subjectRequestRef.current.abort()
    }

    const controller = new AbortController()
    subjectRequestRef.current = controller

    try {
      const response = await api.get('/subjects', {
        signal: controller.signal,
        params: { limit: 100 }
      })

      if (controller.signal.aborted) {
        return
      }

      setSubjects(response.data.subjects || [])
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) {
        return
      }

      logger.error('Failed to load student subjects for materials', fetchError)
      setSubjects([])
      setError((current) => current || fetchError.response?.data?.message || 'Unable to load your subjects right now.')
      throw fetchError
    } finally {
      if (subjectRequestRef.current === controller) {
        subjectRequestRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')

    void Promise.allSettled([
      fetchMaterials(),
      fetchSubjects()
    ]).finally(() => {
      setLoading(false)
    })

    return () => {
      if (materialRequestRef.current) {
        materialRequestRef.current.abort()
        materialRequestRef.current = null
      }

      if (subjectRequestRef.current) {
        subjectRequestRef.current.abort()
        subjectRequestRef.current = null
      }
    }
  }, [fetchMaterials, fetchSubjects])

  useEffect(() => {
    return () => {
      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }
    }
  }, [previewFile])

  const filtered = filterSubject
    ? materials.filter(m => m.subject?.code === filterSubject)
    : materials

  const getFileIcon = (url) => {
    if (!url) return '📄'
    const ext = url.split('.').pop().toLowerCase()
    if (['pdf'].includes(ext)) return '📕'
    if (['doc', 'docx'].includes(ext)) return '📘'
    if (['ppt', 'pptx'].includes(ext)) return '📙'
    if (['xls', 'xlsx'].includes(ext)) return '📗'
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️'
    if (['mp4', 'mov', 'avi'].includes(ext)) return '🎬'
    if (['zip', 'rar'].includes(ext)) return '🗜️'
    return '📄'
  }

  const isPdfFile = (url) => {
    if (!url) return false
    return url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/uploads/')
  }

  const fileTypeTone = (url = '') => {
    const ext = (url.split('.').pop() || '').toLowerCase()
    if (ext === 'pdf') return 'status-absent'
    if (['doc', 'docx'].includes(ext)) return 'grade-merit'
    if (['ppt', 'pptx'].includes(ext)) return 'status-late'
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'status-present'
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'grade-average'
    return 'ui-status-badge ui-status-neutral'
  }

  const openPreview = async (title, fileUrl) => {
    if (!fileUrl) {
      showToast({
        title: 'Preview unavailable',
        description: 'This file link is invalid, so the preview cannot be opened.',
        type: 'error'
      })
      return
    }

    try {
      const { blob } = await fetchFileBlob(fileUrl)
      const objectUrl = window.URL.createObjectURL(blob)

      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }

      setPreviewFile({ title, url: objectUrl, objectUrl, canEmbed: blob.type === 'application/pdf' })
    } catch {
      showToast({
        title: 'Preview unavailable',
        description: 'This file could not be opened right now.',
        type: 'error'
      })
    }
  }

  const handleOpenMaterial = async (fileUrl) => {
    try {
      await openFileUrl(fileUrl)
    } catch {
      showToast({
        title: 'Open failed',
        description: 'This file could not be opened right now.',
        type: 'error'
      })
    }
  }

  return (
    <StudentLayout>
      <div className="p-8">

        <PageHeader
          title="Study Materials"
          subtitle="Access learning resources shared by your instructors"
          breadcrumbs={['Student', 'Materials']}
        />

        <Alert type="error" message={error} />

        {/* Subject Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilterSubject('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${!filterSubject ? 'ui-role-fill' : 'ui-card text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}
          >
            All Subjects
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSubject(s.code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${filterSubject === s.code ? 'ui-role-fill' : 'ui-card text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'}`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-56" />
        ) : (
          <>
            {/* Stats */}
            <div className="ui-card mb-6 flex items-center gap-4 rounded-2xl p-4">
              <span className="text-3xl">📚</span>
              <div>
                <p className="font-semibold text-[var(--color-heading)]">{filtered.length} materials available</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {filterSubject ? `Filtered by ${filterSubject}` : 'Across all subjects'}
                </p>
              </div>
            </div>

            {/* Materials Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((mat) => (
                <div key={mat.id} className="ui-card ui-card-hover rounded-2xl p-5">
                  <div className="mb-4 flex flex-col items-center text-center">
                    <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${fileTypeTone(mat.fileUrl)}`}>
                      {(mat.fileUrl.split('.').pop() || 'file').toUpperCase()}
                    </div>
                    <div className="mb-3 text-5xl">{getFileIcon(mat.fileUrl)}</div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[var(--color-heading)]">{mat.title}</h3>
                      <p className="mt-1 text-xs text-[var(--color-text-soft)]">by {mat.instructor?.user?.name}</p>
                    </div>
                  </div>
                  {mat.description && (
                    <p className="mb-3 line-clamp-2 text-xs text-[var(--color-text-muted)]">{mat.description}</p>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className="grade-merit rounded-full px-2 py-1 text-xs font-medium">
                      {mat.subject?.name}
                    </span>
                    <span className="text-xs text-[var(--color-text-soft)]">
                      {new Date(mat.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {isPdfFile(mat.fileUrl) ? (
                    <button
                      type="button"
                      onClick={() => openPreview(mat.title, mat.fileUrl)}
                      className="ui-role-fill block w-full rounded-lg py-2 text-center text-xs font-medium transition"
                    >
                      View PDF
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenMaterial(mat.fileUrl)}
                      className="ui-role-fill block w-full rounded-lg py-2 text-center text-xs font-medium transition"
                    >
                      Open Material
                    </button>
                  )}
              </div>
            ))}
              {filtered.length === 0 && (
                <div className="col-span-3">
                  <EmptyState
                    icon="📚"
                    title="No materials available yet"
                    description="Materials shared by your instructors will appear here once they are uploaded."
                  />
                </div>
              )}
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
                  Open PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentMaterials



