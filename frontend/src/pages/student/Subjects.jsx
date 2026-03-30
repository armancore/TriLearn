import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'

const StudentSubjects = () => {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSubjects() }, [])

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data.subjects)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">My Subjects</h1>
          <p className="text-gray-500 text-sm mt-1">All your enrolled subjects</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <div key={subject.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded">
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
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-400">Instructor:</span>
                  <span className="text-xs font-medium text-gray-700">
                    {subject.instructor?.user?.name || 'Not assigned'}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>📝 {subject._count?.assignments} assignments</span>
                  <span>📋 {subject._count?.materials} materials</span>
                </div>
                {subject.department && (
                  <div className="mt-3">
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded">
                      {subject.department}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {subjects.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-400">
                No subjects found
              </div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentSubjects