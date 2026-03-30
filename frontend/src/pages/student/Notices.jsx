import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'

const typeColors = {
  GENERAL: 'bg-gray-100 text-gray-700',
  EXAM: 'bg-red-100 text-red-700',
  HOLIDAY: 'bg-green-100 text-green-700',
  EVENT: 'bg-blue-100 text-blue-700',
  URGENT: 'bg-orange-100 text-orange-700',
}

const StudentNotices = () => {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchNotices() }, [])

  const fetchNotices = async () => {
    try {
      const res = await api.get('/notices')
      setNotices(res.data.notices)
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
          <h1 className="text-2xl font-bold text-gray-800">Notices</h1>
          <p className="text-gray-500 text-sm mt-1">Stay updated with school announcements</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <div key={notice.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${typeColors[notice.type]}`}>
                    {notice.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(notice.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-400">by {notice.user?.name}</span>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2">{notice.title}</h3>
                <p className="text-sm text-gray-600">{notice.content}</p>
              </div>
            ))}
            {notices.length === 0 && (
              <div className="text-center py-12 text-gray-400">No notices yet</div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentNotices