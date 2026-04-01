import { useState, useEffect } from 'react'
import InstructorLayout from '../../layouts/InstructorLayout'
import api from '../../utils/api'
import logger from '../../utils/logger'
const InstructorSubjects = () => {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSubjects() }, [])

  const fetchSubjects = async () => {
    try {
      setLoading(true)
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (error) {
      logger.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <InstructorLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">My Subjects</h1>
          <p className="text-gray-500 text-sm mt-1">Subjects assigned to you</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <div key={subject.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                    {subject.code}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    Sem {subject.semester}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">{subject.name}</h3>
                {subject.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{subject.description}</p>
                )}
                <div className="flex gap-4 text-xs text-gray-500 mb-3">
                  <span>📝 {subject._count?.assignments} assignments</span>
                  <span>👥 {subject._count?.attendances} records</span>
                  <span>🎓 {subject._count?.enrollments || 0} students</span>
                </div>
                {subject.department && (
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded">
                    {subject.department}
                  </span>
                )}
              </div>
            ))}
            {subjects.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                No subjects assigned yet
              </div>
            )}
          </div>
        )}
      </div>
    </InstructorLayout>
  )
}

export default InstructorSubjects



