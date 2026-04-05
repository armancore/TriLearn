import { useCallback, useEffect, useState } from 'react'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StudentLayout from '../../layouts/StudentLayout'
import useApi from '../../hooks/useApi'
import { useToast } from '../../components/Toast'
import api, { isEmbeddablePdfUrl, resolveFileUrl } from '../../utils/api'

const StudentMaterials = () => {
  const [filterSubject, setFilterSubject] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const { showToast } = useToast()
  const {
    data: materials = [],
    loading,
    execute: executeMaterials
  } = useApi({ initialData: [], initialLoading: true })
  const {
    data: subjects = [],
    execute: executeSubjects
  } = useApi({ initialData: [] })

  const fetchMaterials = useCallback(async () => {
    await executeMaterials(
      (signal) => api.get('/materials', { signal }),
      {
        transform: (response) => response.data.materials
      }
    )
  }, [executeMaterials])

  const fetchSubjects = useCallback(async () => {
    await executeSubjects(
      (signal) => api.get('/subjects', { signal }),
      {
        transform: (response) => response.data.subjects
      }
    )
  }, [executeSubjects])

  useEffect(() => {
    void fetchMaterials()
    void fetchSubjects()
  }, [fetchMaterials, fetchSubjects])

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

  const openPreview = (title, fileUrl) => {
    const resolvedUrl = resolveFileUrl(fileUrl)
    if (!resolvedUrl) {
      showToast({
        title: 'Preview unavailable',
        description: 'This file link is invalid, so the preview cannot be opened.',
        type: 'error'
      })
      return
    }

    setPreviewFile({ title, url: resolvedUrl, canEmbed: isEmbeddablePdfUrl(resolvedUrl) })
  }

  return (
    <StudentLayout>
      <div className="p-8">

        <PageHeader
          title="Study Materials"
          subtitle="Access learning resources shared by your instructors"
          breadcrumbs={['Student', 'Materials']}
        />

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
                    (() => {
                      const materialUrl = resolveFileUrl(mat.fileUrl)

                      if (!materialUrl) {
                        return (
                          <button
                            type="button"
                            disabled
                            className="block w-full cursor-not-allowed text-center text-xs bg-slate-200 text-slate-500 py-2 rounded-lg font-medium"
                          >
                            Invalid File Link
                          </button>
                        )
                      }

                      return (
                        <a
                          href={materialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ui-role-fill block rounded-lg py-2 text-center text-xs font-medium transition"
                        >
                          Open Material
                        </a>
                      )
                    })()
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
          <div className="ui-card flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-xl">
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
                  onClick={() => setPreviewFile(null)}
                  className="text-xl text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
                >
                  ✕
                </button>
              </div>
            </div>
            {previewFile.canEmbed ? (
              <iframe
                src={previewFile.url}
                title={previewFile.title}
                className="w-full flex-1"
                sandbox="allow-downloads"
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


