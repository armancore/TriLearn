import { useState, useEffect } from 'react'
import { BookOpenText, GraduationCap, ShieldUser, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
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

const DEEP_BLUE = '#1A3C6E'
const SAFFRON = '#F4A623'
const CHART_HEIGHT = 260

// TODO: Replace with GET /api/v1/attendance/summary when an admin trend endpoint is available.
const attendanceTrendFallback = [
  { month: 'Nov', percentage: 82 },
  { month: 'Dec', percentage: 84 },
  { month: 'Jan', percentage: 79 },
  { month: 'Feb', percentage: 86 },
  { month: 'Mar', percentage: 88 },
  { month: 'Apr', percentage: 91 }
]

// TODO: Replace with real grade distribution data when an admin marks summary endpoint is available.
const marksDistributionFallback = [
  { grade: 'A+', count: 18 },
  { grade: 'A', count: 42 },
  { grade: 'B+', count: 56 },
  { grade: 'B', count: 49 },
  { grade: 'C+', count: 31 },
  { grade: 'C', count: 19 },
  { grade: 'F', count: 8 }
]

const normalizeChartArray = (value) => (Array.isArray(value) ? value : [])

const normalizeDepartmentBreakdown = (nextStats) => {
  const source = normalizeChartArray(
    nextStats.departmentBreakdown ||
    nextStats.studentsByDepartment ||
    nextStats.enrollmentByDepartment
  )

  if (source.length > 0) {
    return source.map((item) => ({
      name: item.name || item.department || item.label || 'Department',
      value: item.value ?? item.count ?? item.students ?? 0
    }))
  }

  return [{ name: 'Students', value: nextStats.totalStudents || 0 }]
}

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalInstructors: 0,
    totalSubjects: 0,
  })
  const [chartData, setChartData] = useState({
    attendanceTrend: attendanceTrendFallback,
    departmentBreakdown: [{ name: 'Students', value: 0 }],
    marksDistribution: marksDistributionFallback
  })
  // Tracks which charts are still showing placeholder data (no real endpoint yet)
  const [sampleData, setSampleData] = useState({ attendanceTrend: true, marksDistribution: true })
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
      const realAttendanceTrend = normalizeChartArray(nextStats.attendanceTrend || nextStats.monthlyAttendanceTrend)
      const realMarksDistribution = normalizeChartArray(nextStats.marksDistribution || nextStats.gradeDistribution)
      setChartData({
        attendanceTrend: realAttendanceTrend.length > 0 ? realAttendanceTrend : attendanceTrendFallback,
        departmentBreakdown: normalizeDepartmentBreakdown(nextStats),
        marksDistribution: realMarksDistribution.length > 0 ? realMarksDistribution : marksDistributionFallback
      })
      setSampleData({
        attendanceTrend: realAttendanceTrend.length === 0,
        marksDistribution: realMarksDistribution.length === 0
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
      <div className="admin-page p-4 md:p-8">
        <LoadingSkeleton rows={5} itemClassName="h-24" />
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout>
      <div className="admin-page p-4 md:p-8">

        <PageHeader
          title="Dashboard"
          subtitle="Institution analytics, account activity, and academic operations at a glance."
          breadcrumbs={['Admin', 'Dashboard']}
        />

        {error && <div className="bg-accent-50 text-accent-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard title="Total Users" value={stats.totalUsers} icon={Users} iconClassName="from-sky-600 to-cyan-500" trend={`${recentUsers.length} recent`} trendLabel="latest accounts shown" />
          <StatCard title="Students" value={stats.totalStudents} icon={GraduationCap} iconClassName="from-emerald-500 to-green-600" trend={`${stats.totalStudents} total`} trendLabel="active enrollments" />
          <StatCard title="Instructors" value={stats.totalInstructors} icon={ShieldUser} iconClassName="from-teal-600 to-sky-600" trend={`${stats.totalInstructors} total`} trendLabel="teaching staff" />
          <StatCard title="Subjects" value={stats.totalSubjects} icon={BookOpenText} iconClassName="from-amber-500 to-orange-500" trend={`${stats.totalSubjects} total`} trendLabel="curriculum entries" />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="ui-card min-w-0 rounded-2xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="ui-heading-tight text-lg font-semibold text-[var(--color-text)]">Monthly attendance trend</h2>
              {sampleData.attendanceTrend && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Sample data</span>
              )}
            </div>
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
                <BarChart data={chartData.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip formatter={(value) => [`${value}%`, 'Attendance']} />
                  <Bar dataKey="percentage" fill={DEEP_BLUE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-card min-w-0 rounded-2xl p-6">
            <h2 className="ui-heading-tight mb-4 text-lg font-semibold text-[var(--color-text)]">Subject enrollment breakdown</h2>
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
                <PieChart>
                  <Pie
                    data={chartData.departmentBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {chartData.departmentBreakdown.map((entry, index) => (
                      <Cell key={entry.name} fill={index % 2 === 0 ? DEEP_BLUE : SAFFRON} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-card min-w-0 rounded-2xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="ui-heading-tight text-lg font-semibold text-[var(--color-text)]">Marks distribution</h2>
              {sampleData.marksDistribution && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Sample data</span>
              )}
            </div>
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
                <BarChart data={chartData.marksDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="grade" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => [value, 'Students']} />
                  <Bar dataKey="count" fill={SAFFRON} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
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
                icon={Users}
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



