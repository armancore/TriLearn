import { useState, useEffect } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'

const InstructorMaterials = () => {
  const [materials, setMaterials] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', fileUrl: '', subjectId: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filterSubject, setFilterSubject] = useState('')

  useEffect(() => {
    fetchMaterials()
    fetchSubjects()
  }, [])

  const fetchMaterials = async () => {
    try {
      setLoading(true)
      const res = await api.get('/materials')
      setMaterials(res.data.materials)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/materials', form)
      setSuccess('Material uploaded successfully!')
      setShowModal(false)
      setForm({ title: '', description: '', fileUrl: '', subjectId: '' })
      fetchMaterials()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this material?')) return
    try {
      await api.delete(`/materials/${id}`)
      setSuccess('Material deleted!')
      fetchMaterials()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    }
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

  return (
    <InstructorLayout>
      <div className="p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Study Materials</h1>
            <p className="text-gray-500 text-sm mt-1">Upload and manage learning resources</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setError('') }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
          >
            + Upload Material
          </button>
        </div>

        {success && <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {/* Subject Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilterSubject('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${!filterSubject ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
          >
            All
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setFilterSubject(s.code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition
                ${filterSubject === s.code ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {/* Materials Grid */}
        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((mat) => (
              <div key={mat.id} className="bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{getFileIcon(mat.fileUrl)}</span>
                  <button
                    onClick={() => handleDelete(mat.id)}
                    className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-lg hover:bg-red-100 transition"
                  >
                    Delete
                  </button>
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{mat.title}</h3>
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
                <a
                  href={mat.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-center text-xs bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
                >
                  📥 Open / Download
                </a>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                No materials uploaded yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Upload Material</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
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
              <input
                type="url" placeholder="File URL (Google Drive, Dropbox, etc.)" required
                value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 -mt-2">
                💡 Tip: Upload to Google Drive and paste the shareable link
              </p>
              <select
                required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select Subject</option>
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
          </div>
        </div>
      )}
    </InstructorLayout>
  )
}

export default InstructorMaterials