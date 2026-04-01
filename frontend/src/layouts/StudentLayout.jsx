import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const menuItems = [
  { path: '/student', label: 'Dashboard', icon: '📊' },
  { path: '/student/scan', label: 'Scan QR', icon: '📷' },
  { path: '/student/subjects', label: 'My Subjects', icon: '📚' },
  { path: '/student/attendance', label: 'My Attendance', icon: '✅' },
  { path: '/student/assignments', label: 'Assignments', icon: '📝' },
  { path: '/student/marks', label: 'Exam Results', icon: '🎯' },
  { path: '/student/notices', label: 'Notices', icon: '📢' },
  { path: '/student/materials', label: 'Materials', icon: '📁' },
  { path: '/student/routine', label: 'Routine', icon: '🗓️' }
]

const StudentLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-100 md:flex">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-gray-950/40 md:hidden"
        />
      )}

      <div className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm md:hidden">
        <div>
          <h1 className="text-lg font-bold text-gray-800">EduNexus</h1>
          <p className="text-xs text-gray-500">Student Panel</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
        >
          Menu
        </button>
      </div>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-purple-700 text-white transition-transform duration-300 md:static md:z-auto md:min-h-screen md:w-auto md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarOpen ? 'md:w-64' : 'md:w-16'}`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-purple-600">
          {(sidebarOpen || mobileMenuOpen) && (
            <div>
              <h1 className="text-xl font-bold">EduNexus</h1>
              <p className="text-purple-200 text-xs">Student Panel</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden rounded p-1 text-white hover:bg-purple-600 md:block"
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded p-1 text-white hover:bg-purple-600 md:hidden"
            >
              x
            </button>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-2 mt-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg mb-1 transition
                ${location.pathname === item.path
                  ? 'bg-white text-purple-700 font-semibold'
                  : 'hover:bg-purple-600 text-white'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              {(sidebarOpen || mobileMenuOpen) && <span className="text-sm">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-purple-600">
          {(sidebarOpen || mobileMenuOpen) && (
            <div className="mb-3">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-purple-200 text-xs">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-purple-200 hover:text-white transition"
          >
            <span>🚪</span>
            {(sidebarOpen || mobileMenuOpen) && <span>Logout</span>}
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="flex-1 overflow-x-hidden">
        {children}
      </div>

    </div>
  )
}

export default StudentLayout
