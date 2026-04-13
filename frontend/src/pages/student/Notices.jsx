import { useState, useEffect } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const noticeToneClasses = {
  URGENT: 'border-l-red-500',
  EXAM: 'border-l-orange-500',
  GENERAL: 'border-l-slate-400',
  EVENT: 'border-l-blue-500',
  HOLIDAY: 'border-l-green-500'
}

const relativeDate = (value) => {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'UN'

const StudentNotices = () => {
  const [notices, setNotices] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedNoticeIds, setExpandedNoticeIds] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    const fetchNotices = async () => {
      try {
        setLoading(true)
        const res = await api.get(`/notices?page=${page}&limit=${limit}`, { signal: controller.signal })
        setNotices(res.data.notices)
        setTotal(res.data.total)
      } catch (error) {
        if (isRequestCanceled(error)) return
        logger.error('Failed to load student notices', error)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchNotices()
    return () => controller.abort()
  }, [limit, page])

  const toggleExpanded = (noticeId) => {
    setExpandedNoticeIds((current) => (
      current.includes(noticeId)
        ? current.filter((id) => id !== noticeId)
        : [...current, noticeId]
    ))
  }

  return (
    <StudentLayout>
      <div className="p-8">
        <PageHeader
          title="Notices"
          subtitle="Stay updated with school announcements"
          breadcrumbs={['Student', 'Notices']}
        />

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-28" />
        ) : (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className={`ui-card rounded-2xl border-l-4 p-6 hover:shadow-md dark:shadow-slate-900/50 transition ${noticeToneClasses[notice.type] || noticeToneClasses.GENERAL}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="ui-role-fill flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white">
                      {initialsFromName(notice.user?.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{notice.user?.name || 'Unknown author'}</p>
                      <p className="text-xs text-slate-400">{relativeDate(notice.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <StatusBadge status={notice.type} />
                    <span className="text-xs text-gray-400">
                      {new Date(notice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-[--color-text] dark:text-slate-100 mb-2">{notice.title}</h3>
                  <p className={`text-sm text-[--color-text-muted] dark:text-slate-400 ${expandedNoticeIds.includes(notice.id) ? '' : 'line-clamp-2'}`}>{notice.content}</p>
                  {notice.content.length > 140 ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(notice.id)}
                      className="mt-3 text-sm font-medium text-[var(--color-role-accent)]"
                    >
                      {expandedNoticeIds.includes(notice.id) ? 'Read Less' : 'Read More'}
                    </button>
                  ) : null}
                </div>
              ))}
              {notices.length === 0 && (
                <EmptyState
                  icon="📣"
                  title="No notices yet"
                  description="New campus and classroom updates will appear here once they are published."
                />
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



