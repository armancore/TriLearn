import { useState, useEffect } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import PageHeader from '../../components/PageHeader'
import StudentLayout from '../../layouts/StudentLayout'
import useApi from '../../hooks/useApi'
import { useToast } from '../../components/Toast'
import api, { resolveFileUrl } from '../../utils/api'

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

  useEffect(() => {
    fetchMaterials()
    fetchSubjects()
  }, [])

  const fetchMaterials = async () => {
    await executeMaterials(
      () => api.get('/materials'),
      {
        transform: (response) => response.data.materials
      }
    )
  }

  const fetchSubjects = async () => {
    await executeSubjects(
      () => api.get('/subjects'),
      {
        transform: (response) => response.data.subjects
      }
    )
  }

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
    if (ext === 'pdf') return 'bg-rose-50 text-rose-700'
    if (['doc', 'docx'].includes(ext)) return 'bg-blue-50 text-blue-700'
    if (['ppt', 'pptx'].includes(ext)) return 'bg-amber-50 text-amber-700'
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'bg-emerald-50 text-emerald-700'
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'bg-violet-50 text-violet-700'
    return 'bg-slate-100 text-slate-700'
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

    setPreviewFile({ title, url: resolvedUrl })
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
              ${!filterSubject ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
          >
            All Subjects
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSubject(s.code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${filterSubject === s.code ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingSpinner text="Loading materials..." />
        ) : (
          <>
            {/* Stats */}
            <div className="bg-purple-50 rounded-2xl p-4 mb-6 flex items-center gap-4">
              <span className="text-3xl">📚</span>
              <div>
                <p className="font-semibold text-gray-800">{filtered.length} materials available</p>
                <p className="text-sm text-gray-500">
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
                      <h3 className="font-semibold text-gray-800 truncate">{mat.title}</h3>
                      <p className="text-xs text-gray-400 mt-1">by {mat.instructor?.user?.name}</p>
                    </div>
                  </div>
                  {mat.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{mat.description}</p>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full font-medium">
                      {mat.subject?.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(mat.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {isPdfFile(mat.fileUrl) ? (
                    <button
                      type="button"
                      onClick={() => openPreview(mat.title, mat.fileUrl)}
                      className="block w-full text-center text-xs bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium"
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
                          className="block text-center text-xs bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium"
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-purple-600 hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={previewFile.url}
              title={previewFile.title}
              className="w-full flex-1"
              sandbox="allow-downloads"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentMaterials


