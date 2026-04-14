import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useReferenceData } from '../../context/ReferenceDataContext'
import api, { fetchFileBlob, openFileUrl } from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const InstructorMaterials = () => {
  const { user } = useAuth()
  const isCoordinator = user?.role === 'COORDINATOR'
  const Layout = isCoordinator ? CoordinatorLayout : InstructorLayout
  const [searchParams, setSearchParams] = useSearchParams()
  const materialRequestRef = useRef(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', fileUrl: '', subjectId: '' })
  const [materialPdf, setMaterialPdf] = useState(null)
  const { showToast } = useToast()
  const [filterSubject, setFilterSubject] = useState(searchParams.get('subject') || '')
  const [materialToDelete, setMaterialToDelete] = useState(null)
  const [deletingMaterial, setDeletingMaterial] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { subjects = [], loadSubjects } = useReferenceData()

  const fetchMaterials = useCallback(async () => {
    if (materialRequestRef.current) {
      materialRequestRef.current.abort()
    }

    const controller = new AbortController()
    materialRequestRef.current = controller

    try {
      setLoading(true)
      setError('')

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

      logger.error('Failed to load materials', fetchError)
      setMaterials([])
      setError(fetchError.response?.data?.message || 'Unable to load materials right now.')
      throw fetchError
    } finally {
      if (materialRequestRef.current === controller) {
        materialRequestRef.current = null
      }

      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  const syncSubjectInUrl = useCallback((nextSubjectId) => {
    const nextParams = new URLSearchParams(searchParams)

    if (nextSubjectId) {
      nextParams.set('subject', nextSubjectId)
    } else {
      nextParams.delete('subject')
    }

    const currentQuery = searchParams.toString()
    const nextQuery = nextParams.toString()

    if (currentQuery !== nextQuery) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleSubjectChange = useCallback((nextSubjectId) => {
    setFilterSubject(nextSubjectId)
    syncSubjectInUrl(nextSubjectId)
    setForm((current) => ({
      ...current,
      subjectId: nextSubjectId || current.subjectId
    }))
  }, [syncSubjectInUrl])

  useEffect(() => {
    void fetchMaterials().catch((fetchError) => {
      if (isRequestCanceled(fetchError)) {
        return
      }
    })

    return () => {
      if (materialRequestRef.current) {
        materialRequestRef.current.abort()
        materialRequestRef.current = null
      }
    }
  }, [fetchMaterials])

  useEffect(() => {
    const controller = new AbortController()
    void loadSubjects({ signal: controller.signal }).catch((loadError) => {
      if (isRequestCanceled(loadError)) {
        return
      }

      setError('Unable to load your modules right now.')
    })

    return () => controller.abort()
  }, [loadSubjects, setError])

  useEffect(() => {
    if (subjects.length === 0) {
      setFilterSubject('')
      setForm((current) => ({ ...current, subjectId: '' }))
      return
    }

    const hasSelectedSubject = filterSubject
      ? subjects.some((subject) => subject.id === filterSubject)
      : true

    if (!hasSelectedSubject) {
      setFilterSubject('')
      syncSubjectInUrl('')
    }

    setForm((current) => ({
      ...current,
      subjectId: current.subjectId && subjects.some((subject) => subject.id === current.subjectId)
        ? current.subjectId
        : (filterSubject && subjects.some((subject) => subject.id === filterSubject)
            ? filterSubject
            : subjects[0]?.id || '')
    }))
  }, [filterSubject, subjects, syncSubjectInUrl])

  useEffect(() => {
    return () => {
      if (previewFile?.objectUrl) {
        window.URL.revokeObjectURL(previewFile.objectUrl)
      }
    }
  }, [previewFile])

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
      setForm({ title: '', description: '', fileUrl: '', subjectId: form.subjectId || filterSubject || subjects[0]?.id || '' })
      setMaterialPdf(null)
      await fetchMaterials().catch((fetchError) => {
        if (isRequestCanceled(fetchError)) {
          return
        }
      })
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
      await fetchMaterials().catch((fetchError) => {
        if (isRequestCanceled(fetchError)) {
          return
        }
      })
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
    if (ext === 'pdf') return 'bg-accent-50 text-accent-700'
    if (['doc', 'docx'].includes(ext)) return 'bg-primary-50 text-primary'
    if (['ppt', 'pptx'].includes(ext)) return 'bg-accent-50 text-accent-700'
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'bg-primary-50 text-primary'
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'bg-primary-50 text-primary'
    return 'bg-slate-100 text-slate-700'
  }

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
    } catch {
      setError('Unable to open this file right now.')
    }
  }

  const handleOpenMaterial = async (fileUrl) => {
    try {
      await openFileUrl(fileUrl)
    } catch {
      setError('Unable to open this file right now.')
    }
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
            disabled: !isCoordinator && subjects.length === 0,
            onClick: () => {
              if (!subjects.length) {
                setError('No assigned modules found. Ask an admin or coordinator to assign a module to this instructor first.')
                return
              }

              setShowModal(true)
              setError('')
              setForm((current) => ({
                ...current,
                subjectId: filterSubject || subjects[0]?.id || current.subjectId
              }))
            }
          }]}
        />

        <Alert type="error" message={error} />

        {/* Subject Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => handleSubjectChange('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${!filterSubject ? 'bg-primary text-white' : 'bg-[--color-bg-card] dark:bg-slate-800 text-[--color-text-muted] dark:text-slate-400 border hover:bg-[--color-bg] dark:bg-slate-900'}`}
          >
            All Modules
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => handleSubjectChange(s.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${filterSubject === s.id ? 'bg-primary text-white' : 'bg-[--color-bg-card] dark:bg-slate-800 text-[--color-text-muted] dark:text-slate-400 border hover:bg-[--color-bg] dark:bg-slate-900'}`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {/* Materials Grid */}
        {!isCoordinator && subjects.length === 0 && !loading ? (
          <div className="rounded-2xl bg-[--color-bg-card] dark:bg-slate-800 p-10 shadow-sm dark:shadow-slate-900/50">
            <EmptyState
              icon="📚"
              title="No modules available yet"
              description="Your assigned modules will appear here once an admin or coordinator links them to your account."
            />
          </div>
        ) : loading ? (
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
                      <h3 className="font-semibold text-[--color-text] dark:text-slate-100 mb-1">{mat.title}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setMaterialToDelete(mat)}
                    className="text-xs bg-accent-50 text-accent-600 px-2 py-1 rounded-lg hover:bg-accent-100 transition"
                  >
                    Delete
                  </button>
                </div>
                {mat.description && (
                  <p className="text-xs text-[--color-text-muted] dark:text-slate-400 mb-3 line-clamp-2">{mat.description}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs bg-primary-50 text-primary px-2 py-1 rounded-full font-medium">
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
                    className="mt-3 block w-full text-center text-xs bg-primary text-white py-2 rounded-lg hover:bg-primary-700 transition font-medium"
                  >
                    View PDF
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenMaterial(mat.fileUrl)}
                    className="mt-3 block w-full text-center text-xs bg-primary text-white py-2 rounded-lg hover:bg-primary-700 transition font-medium"
                  >
                    Open / Download
                  </button>
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
                className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <textarea
                placeholder="Description (optional)" rows={3}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div>
                <label className="block text-sm text-[--color-text-muted] dark:text-slate-400 mb-1">Upload PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setMaterialPdf(e.target.files?.[0] || null)}
                  className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Optional. Upload a PDF directly from your device.</p>
              </div>
              <input
                type="url" placeholder="Or paste a file URL (Google Drive, Dropbox, etc.)"
                value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-400 -mt-2">
                Use either an uploaded PDF or an external file link.
              </p>
              <select
                required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full border border-[--color-border] dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select Module</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.code}</option>
                ))}
              </select>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-[--color-border] dark:border-slate-700 text-[--color-text-muted] dark:text-slate-400 py-2 rounded-lg text-sm hover:bg-[--color-bg] dark:bg-slate-900">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary-700 font-medium">
                  Upload
                </button>
              </div>
            </form>
        </Modal>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] shadow-xl dark:shadow-slate-900/50 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-[--color-text] dark:text-slate-100">{previewFile.title}</h2>
              <div className="flex items-center gap-3">
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
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
                  className="text-gray-400 hover:text-[--color-text-muted] dark:text-slate-400 text-xl"
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
                <p className="text-sm text-[--color-text-muted] dark:text-slate-400">
                  This file can be opened in a new tab, but embedded preview is only available for PDFs stored in this app.
                </p>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
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



