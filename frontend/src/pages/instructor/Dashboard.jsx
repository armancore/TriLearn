import { useState, useEffect } from 'react'
import { BellRing, BookOpenText, ClipboardList } from 'lucide-react'
import InstructorLayout from '../../layouts/InstructorLayout'
import EmptyState from '../../components/EmptyState'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import logger from '../../utils/logger'

const noticeBadgeClasses = {
  EXAM: 'ui-status-badge ui-status-warning',
  URGENT: 'ui-status-badge ui-status-danger',
  EVENT: 'ui-status-badge ui-status-info'
}

const InstructorDashboard = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalSubjects: 0,
    totalAssignments: 0,
    totalNotices: 0,
  })
  const [subjects, setSubjects] = useState([])
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      try {
        setLoading(true)
        setError('')

        const [subjectsRes, assignmentsRes, noticesRes] = await Promise.all([
          api.get('/subjects', { signal: controller.signal }),
          api.get('/assignments', { signal: controller.signal }),
          api.get('/notices', { signal: controller.signal }),
        ])

        if (controller.signal.aborted) {
          return
        }

        setSubjects(subjectsRes.data.subjects.slice(0, 3))
        setNotices(noticesRes.data.notices.slice(0, 3))
        setStats({
          totalSubjects: subjectsRes.data.total,
          totalAssignments: assignmentsRes.data.total,
          totalNotices: noticesRes.data.total,
        })
      } catch (error) {
        if (error?.code === 'ERR_CANCELED') {
          return
        }

        logger.error(error)
        setError('Unable to load the instructor dashboard right now.')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchData()

    return () => {
      controller.abort()
    }
  }, [])

  if (loading || (error && subjects.length === 0 && notices.length === 0)) return (
    <InstructorLayout>
      <div className="p-4 md:p-8">
        {error ? (
          <div className="mb-6 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-600">{error}</div>
        ) : null}
        <LoadingSkeleton rows={5} itemClassName="h-24" />
      </div>
    </InstructorLayout>
  )

  return (
    <InstructorLayout>
      <div className="p-4 md:p-8">

        <PageHeader
          title={`Welcome back, ${user?.name}!`}
          subtitle="Here's what's happening in your classes today"
          breadcrumbs={['Instructor', 'Dashboard']}
        />

        {error ? (
          <div className="mb-6 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-600">{error}</div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
          <StatCard title="My Subjects" value={stats.totalSubjects} icon={BookOpenText} iconClassName="from-emerald-500 to-green-600" trend={`${subjects.length} shown`} trendLabel="latest teaching load" />
          <StatCard title="Assignments" value={stats.totalAssignments} icon={ClipboardList} iconClassName="from-blue-500 to-cyan-600" trend={`${stats.totalAssignments} total`} trendLabel="currently published" />
          <StatCard title="Notices" value={stats.totalNotices} icon={BellRing} iconClassName="from-violet-500 to-purple-600" trend={`${notices.length} recent`} trendLabel="latest updates" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* My Subjects */}
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-[--color-text] dark:text-slate-100 mb-4">My Subjects</h2>
            <div className="space-y-3">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between p-3 bg-[--color-bg] dark:bg-slate-900 rounded-xl">
                  <div>
                    <p className="font-medium text-[--color-text] dark:text-slate-100 text-sm">{subject.name}</p>
                    <p className="text-xs text-[--color-text-muted] dark:text-slate-400">{subject.code} · Sem {subject.semester}</p>
                  </div>
                  <div className="text-right text-xs text-[--color-text-muted] dark:text-slate-400">
                    <p>{subject._count?.assignments} assignments</p>
                    <p>{subject._count?.attendances} attendance</p>
                  </div>
                </div>
              ))}
              {subjects.length === 0 && (
                <EmptyState
                  icon="📚"
                  title="No subjects assigned yet"
                  description="Your assigned subjects will appear here once scheduling is in place."
                />
              )}
            </div>
          </div>

          {/* Recent Notices */}
          <div className="bg-[--color-bg-card] dark:bg-slate-800 rounded-2xl shadow-sm dark:shadow-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-[--color-text] dark:text-slate-100 mb-4">Recent Notices</h2>
            <div className="space-y-3">
              {notices.map((notice) => (
                <div key={notice.id} className="p-3 bg-[--color-bg] dark:bg-slate-900 rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={noticeBadgeClasses[notice.type] || 'ui-status-badge ui-status-neutral'}>
                      {notice.type}
                    </span>
                    <span className="text-xs text-[var(--color-text-soft)]">
                      {new Date(notice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="font-medium text-[--color-text] dark:text-slate-100 text-sm">{notice.title}</p>
                  <p className="text-xs text-[--color-text-muted] dark:text-slate-400 mt-1 line-clamp-1">{notice.content}</p>
                </div>
              ))}
              {notices.length === 0 && (
                <EmptyState
                  icon="📣"
                  title="No notices yet"
                  description="Recent notices will show up here when new campus updates are posted."
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </InstructorLayout>
  )
}

export default InstructorDashboard


