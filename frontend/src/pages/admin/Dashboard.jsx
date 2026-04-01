import { useState, useEffect } from 'react'
import AdminLayout from '../../layouts/AdminLayout'
import api from '../../utils/api'
import logger from '../../utils/logger'
const StatCard = ({ title, value, icon, color }) => (
  <div className={`bg-white rounded-2xl p-6 shadow-sm border-l-4 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <span className="text-4xl">{icon}</span>
    </div>
  </div>
)

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
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const usersRes = await api.get('/admin/users')
      const subjectsRes = await api.get('/subjects')

      const users = usersRes.data.users
      const students = users.filter(u => u.role === 'STUDENT')
      const instructors = users.filter(u => u.role === 'INSTRUCTOR')

      setStats({
        totalUsers: users.length,
        totalStudents: students.length,
        totalInstructors: instructors.length,
        totalSubjects: subjectsRes.data.total,
      })

      setRecentUsers(users.slice(0, 5))

    } catch (error) {
      logger.error(error)
      setError('Unable to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout>
      <div className="p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Welcome to EduNexus Admin Panel</p>
        </div>

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color="border-blue-500" />
          <StatCard title="Students" value={stats.totalStudents} icon="🎓" color="border-green-500" />
          <StatCard title="Instructors" value={stats.totalInstructors} icon="👨‍🏫" color="border-purple-500" />
          <StatCard title="Subjects" value={stats.totalSubjects} icon="📚" color="border-orange-500" />
        </div>

        {/* Recent Users */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-sm font-medium text-gray-800">{user.name}</td>
                    <td className="py-3 text-sm text-gray-500">{user.email}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium
                        ${user.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' :
                          user.role === 'INSTRUCTOR' ? 'bg-purple-100 text-purple-700' :
                          'bg-green-100 text-green-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium
                        ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}

export default Dashboard



