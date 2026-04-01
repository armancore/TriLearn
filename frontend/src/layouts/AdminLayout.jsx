import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isCoordinator = user?.role === 'COORDINATOR'
  const basePath = isCoordinator ? '/coordinator' : '/admin'
  const panelLabel = isCoordinator ? 'Coordinator Panel' : 'Admin Panel'
  const menuItems = useMemo(() => (
    isCoordinator
      ? [
          { path: `${basePath}`, label: 'Dashboard', icon: '📊' },
          { path: `${basePath}/users`, label: 'Students', icon: '👥' },
          { path: `${basePath}/subjects`, label: 'Subjects', icon: '📚' },
          { path: `${basePath}/attendance`, label: 'Attendance', icon: '✅' },
          { path: `${basePath}/assignments`, label: 'Assignments', icon: '📝' },
          { path: `${basePath}/marks`, label: 'Exam Results', icon: '🎯' },
          { path: `${basePath}/notices`, label: 'Notices', icon: '📢' },
          { path: `${basePath}/materials`, label: 'Materials', icon: '📁' },
          { path: `${basePath}/routine`, label: 'Routine', icon: '🗓️' }
        ]
      : [
          { path: `${basePath}`, label: 'Dashboard', icon: '📊' },
          { path: `${basePath}/users`, label: 'Users', icon: '👥' },
          { path: `${basePath}/departments`, label: 'Departments', icon: '🏛️' },
          { path: `${basePath}/subjects`, label: 'Subjects', icon: '📚' },
          { path: `${basePath}/notices`, label: 'Notices', icon: '📢' },
          { path: `${basePath}/routine`, label: 'Routine', icon: '🗓️' }
        ]
  ), [basePath, isCoordinator])

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
          <p className="text-xs text-gray-500">{panelLabel}</p>
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
      <div className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-blue-700 text-white transition-transform duration-300 md:static md:z-auto md:min-h-screen md:w-auto md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarOpen ? 'md:w-64' : 'md:w-16'}`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-blue-600">
          {(sidebarOpen || mobileMenuOpen) && (
            <div>
              <h1 className="text-xl font-bold">EduNexus</h1>
              <p className="text-blue-200 text-xs">{panelLabel}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden rounded p-1 text-white hover:bg-blue-600 md:block"
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded p-1 text-white hover:bg-blue-600 md:hidden"
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
                  ? 'bg-white text-blue-700 font-semibold'
                  : 'hover:bg-blue-600 text-white'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              {(sidebarOpen || mobileMenuOpen) && <span className="text-sm">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-blue-600">
          {(sidebarOpen || mobileMenuOpen) && (
            <div className="mb-3">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-blue-200 text-xs">{user?.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-blue-200 hover:text-white transition"
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

export default AdminLayout
