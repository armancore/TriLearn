import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import logger from '../../utils/logger'
const StudentNotices = () => {
  const [notices, setNotices] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchNotices() }, [page])

  const fetchNotices = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/notices?page=${page}&limit=${limit}`)
      setNotices(res.data.notices)
      setTotal(res.data.total)
    } catch (error) {
      logger.error(error)
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
          <LoadingSpinner text="Loading notices..." />
        ) : (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
                  <div className="flex items-center gap-3 mb-3">
                    <StatusBadge status={notice.type} />
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
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentNotices



