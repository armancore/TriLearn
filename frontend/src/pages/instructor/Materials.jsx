import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageHeader from '../../components/PageHeader'
import InstructorLayout from '../../layouts/InstructorLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import useApi from '../../hooks/useApi'
import api, { isEmbeddablePdfUrl, resolveFileUrl } from '../../utils/api'

const InstructorMaterials = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const [searchParams] = useSearchParams()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', fileUrl: '', subjectId: '' })
  const [materialPdf, setMaterialPdf] = useState(null)
  const { showToast } = useToast()
  const [filterSubject, setFilterSubject] = useState(searchParams.get('subject') || '')
  const [materialToDelete, setMaterialToDelete] = useState(null)
  const [deletingMaterial, setDeletingMaterial] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const {
    data: materials = [],
    loading,
    error,
    setError,
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
        fallbackMessage: 'Unable to load materials',
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (!materialPdf && !form.fileUrl.trim()) {
        setError('Please upload a PDF or provide a file URL')
        return
      }

      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('subjectId', form.subjectId)
      if (form.fileUrl.trim()) payload.append('fileUrl', form.fileUrl.trim())
      if (materialPdf) payload.append('materialPdf', materialPdf)

      await api.post('/materials', payload)
      showToast({ title: 'Material uploaded successfully.' })
      setShowModal(false)
      setForm({ title: '', description: '', fileUrl: '', subjectId: '' })
      setMaterialPdf(null)
      fetchMaterials()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async () => {
    if (!materialToDelete) return
    try {
      setDeletingMaterial(true)
      await api.delete(`/materials/${materialToDelete.id}`)
      setMaterialToDelete(null)
      showToast({ title: 'Material deleted.' })
      fetchMaterials()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setDeletingMaterial(false)
    }
  }

  const filtered = filterSubject
    ? materials.filter(m => m.subjectId === filterSubject)
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
      setError('This file preview is unavailable because the file link is invalid.')
      return
    }

    setPreviewFile({ title, url: resolvedUrl, canEmbed: isEmbeddablePdfUrl(resolvedUrl) })
  }

  return (
    <Layout>
      <div className="p-4 md:p-8">

        <PageHeader
          title={isCoordinator ? 'Department Materials' : 'Module Materials'}
          subtitle={isCoordinator ? 'Add and manage study materials across your department modules.' : 'Open a module, add study materials, and keep each subject resource organized in one place.'}
          breadcrumbs={[isCoordinator ? 'Coordinator' : 'Instructor', 'Modules', 'Materials']}
          actions={[{
            label: 'Add Study Material',
            icon: Plus,
            variant: 'primary',
            onClick: () => {
              setShowModal(true)
              setError('')
              setForm((current) => ({
                ...current,
                subjectId: filterSubject || current.subjectId
              }))
            }
          }]}
        />

        <Alert type="error" message={error} />

        {/* Subject Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilterSubject('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${!filterSubject ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
          >
            All Modules
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSubject(s.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${filterSubject === s.id ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {/* Materials Grid */}
        {loading ? (
          <LoadingSkeleton rows={6} itemClassName="h-56" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((mat) => (
              <div key={mat.id} className="ui-card ui-card-hover rounded-2xl p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${fileTypeTone(mat.fileUrl)}`}>
                      {(mat.fileUrl.split('.').pop() || 'file').toUpperCase()}
                    </div>
                    <div className="text-center">
                      <div className="mb-3 text-5xl">{getFileIcon(mat.fileUrl)}</div>
                      <h3 className="font-semibold text-gray-800 mb-1">{mat.title}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setMaterialToDelete(mat)}
                    className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-lg hover:bg-red-100 transition"
                  >
                    Delete
                  </button>
                </div>
                {mat.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{mat.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full font-medium">
                    {mat.subject?.code}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(mat.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {isPdfFile(mat.fileUrl) ? (
                  <button
                    type="button"
                    onClick={() => openPreview(mat.title, mat.fileUrl)}
                    className="mt-3 block w-full text-center text-xs bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
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
                          className="mt-3 block w-full cursor-not-allowed text-center text-xs bg-slate-200 text-slate-500 py-2 rounded-lg font-medium"
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
                        className="mt-3 block text-center text-xs bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
                      >
                        Open / Download
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
                  title="No materials uploaded yet"
                  description="Upload the first study resource so students have something to open here."
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showModal && (
        <Modal title="Add Study Material To Module" onClose={() => setShowModal(false)}>
            <Alert type="error" message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text" placeholder="Material Title" required
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <textarea
                placeholder="Description (optional)" rows={3}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div>
                <label className="block text-sm text-gray-600 mb-1">Upload PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setMaterialPdf(e.target.files?.[0] || null)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Optional. Upload a PDF directly from your device.</p>
              </div>
              <input
                type="url" placeholder="Or paste a file URL (Google Drive, Dropbox, etc.)"
                value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 -mt-2">
                Use either an uploaded PDF or an external file link.
              </p>
              <select
                required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select Module</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.code}</option>
                ))}
              </select>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 font-medium">
                  Upload
                </button>
              </div>
            </form>
        </Modal>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-green-600 hover:underline"
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
                <p className="text-sm text-gray-500">
                  This file can be opened in a new tab, but embedded preview is only available for PDFs stored in this app.
                </p>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Open PDF
                </a>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!materialToDelete}
        title="Delete Material"
        message={materialToDelete ? `Delete "${materialToDelete.title}"? Students will no longer be able to access it.` : ''}
        confirmText="Delete Material"
        busy={deletingMaterial}
        onClose={() => setMaterialToDelete(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}

export default InstructorMaterials


