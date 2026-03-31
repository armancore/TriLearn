import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const menuItems = [
  { path: '/instructor', label: 'Dashboard', icon: '📊' },
  { path: '/instructor/subjects', label: 'My Subjects', icon: '📚' },
  { path: '/instructor/attendance', label: 'Attendance', icon: '✅' },
  { path: '/instructor/assignments', label: 'Assignments', icon: '📝' },
  { path: '/instructor/marks', label: 'Marks', icon: '🎯' },
  { path: '/instructor/notices', label: 'Notices', icon: '📢' },
  { path: '/instructor/materials', label: 'Materials', icon: '📁' },
  { path: '/instructor/routine', label: 'Routine', icon: '🗓️' }
]

const InstructorLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-green-700 text-white transition-all duration-300 flex flex-col`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-green-600">
          {sidebarOpen && (
            <div>
              <h1 className="text-xl font-bold">EduNexus</h1>
              <p className="text-green-200 text-xs">Instructor Panel</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-green-600 p-1 rounded"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-2 mt-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg mb-1 transition
                ${location.pathname === item.path
                  ? 'bg-white text-green-700 font-semibold'
                  : 'hover:bg-green-600 text-white'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-green-600">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-green-200 text-xs">{user?.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-green-200 hover:text-white transition"
          >
            <span>🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

    </div>
  )
}

export default InstructorLayout