import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api, { resolveFileUrl } from '../../utils/api'

const StudentMaterials = () => {
  const [materials, setMaterials] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSubject, setFilterSubject] = useState('')
  const [previewFile, setPreviewFile] = useState(null)

  useEffect(() => {
    fetchMaterials()
    fetchSubjects()
  }, [])

  const fetchMaterials = async () => {
    try {
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

  return (
    <StudentLayout>
      <div className="p-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Study Materials</h1>
          <p className="text-gray-500 text-sm mt-1">Access learning resources shared by your instructors</p>
        </div>

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
          <div className="text-center text-gray-500 py-8">Loading...</div>
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
                <div key={mat.id} className="bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{getFileIcon(mat.fileUrl)}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{mat.title}</h3>
                      <p className="text-xs text-gray-400">by {mat.instructor?.user?.name}</p>
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
                      onClick={() => setPreviewFile({
                        title: mat.title,
                        url: resolveFileUrl(mat.fileUrl)
                      })}
                      className="block w-full text-center text-xs bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium"
                    >
                      View PDF
                    </button>
                  ) : (
                    <a
                      href={resolveFileUrl(mat.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition font-medium"
                    >
                      Open Material
                    </a>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-400">
                  No materials available yet
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
            />
          </div>
        </div>
      )}
    </StudentLayout>
  )
}

export default StudentMaterials
