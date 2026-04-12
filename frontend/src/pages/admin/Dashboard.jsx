import { useState, useEffect } from 'react'
import { BookOpenText, GraduationCap, ShieldUser, Users } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import EmptyState from '../../components/EmptyState'
import api from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

const roleBadgeClasses = {
  ADMIN: 'ui-status-badge ui-status-info',
  INSTRUCTOR: 'ui-status-badge',
  STUDENT: 'ui-status-badge ui-status-success'
}

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalInstructors: 0,
    totalSubjects: 0,
  })
  const [recentUsers, setRecentUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetchStats(controller.signal)
    return () => controller.abort()
  }, [])

  const fetchStats = async (signal) => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats', { signal }),
        api.get('/admin/users', { params: { page: 1, limit: 5 }, signal })
      ])

      const users = usersRes.data.users || []
      const nextStats = statsRes.data.stats || {}

      setStats({
        totalUsers: nextStats.totalUsers || 0,
        totalStudents: nextStats.totalStudents || 0,
        totalInstructors: nextStats.totalInstructors || 0,
        totalSubjects: nextStats.totalSubjects || 0,
      })

      setRecentUsers(users)

    } catch (error) {
      if (isRequestCanceled(error)) return
      logger.error(error)
      setError('Unable to load dashboard data')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  if (loading) return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <LoadingSkeleton rows={5} itemClassName="h-24" />
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">

        <PageHeader
          title="Dashboard"
          subtitle="Welcome to TriLearn Admin Panel"
          breadcrumbs={['Admin', 'Dashboard']}
        />

        {error && <div className="bg-accent-50 text-accent-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard title="Total Users" value={stats.totalUsers} icon={Users} iconClassName="from-blue-500 to-indigo-600" trend={`${recentUsers.length} recent`} trendLabel="latest accounts shown" />
          <StatCard title="Students" value={stats.totalStudents} icon={GraduationCap} iconClassName="from-emerald-500 to-green-600" trend={`${stats.totalStudents} total`} trendLabel="active enrollments" />
          <StatCard title="Instructors" value={stats.totalInstructors} icon={ShieldUser} iconClassName="from-violet-500 to-purple-600" trend={`${stats.totalInstructors} total`} trendLabel="teaching staff" />
          <StatCard title="Subjects" value={stats.totalSubjects} icon={BookOpenText} iconClassName="from-amber-500 to-orange-500" trend={`${stats.totalSubjects} total`} trendLabel="curriculum entries" />
        </div>

        {/* Recent Users */}
        <div className="ui-card rounded-2xl p-6">
          <h2 className="ui-heading-tight mb-4 text-lg font-semibold text-[var(--color-text)]">Recent Users</h2>
          <div className="space-y-3">
            {recentUsers.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--color-card-border)] bg-[color-mix(in_srgb,var(--color-surface-muted)_88%,transparent)] px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-md dark:shadow-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="ui-role-fill flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white">
                    {initialsFromName(user.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--color-text)]">{user.name}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={roleBadgeClasses[user.role] || 'ui-status-badge ui-status-neutral'}>
                    {user.role}
                  </span>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    user.isActive ? 'bg-primary-50 text-primary' : 'bg-accent-50 text-accent-700'
                  }`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${user.isActive ? 'bg-primary-500' : 'bg-accent'}`} />
                    {user.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>
            ))}
            {recentUsers.length === 0 && (
              <EmptyState
                icon="👥"
                title="No recent users yet"
                description="Newly created users will appear here for a quick admin overview."
              />
            )}
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}

export default Dashboard



