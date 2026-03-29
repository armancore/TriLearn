import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const menuItems = [
  { path: '/admin', label: 'Dashboard', icon: '📊' },
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/subjects', label: 'Subjects', icon: '📚' },
  { path: '/admin/notices', label: 'Notices', icon: '📢' },
]

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-blue-700 text-white transition-all duration-300 flex flex-col`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-blue-600">
          {sidebarOpen && (
            <div>
              <h1 className="text-xl font-bold">EduNexus</h1>
              <p className="text-blue-200 text-xs">Admin Panel</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-blue-600 p-1 rounded"
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
                  ? 'bg-white text-blue-700 font-semibold'
                  : 'hover:bg-blue-600 text-white'
                }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-blue-600">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-blue-200 text-xs">{user?.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-blue-200 hover:text-white transition"
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

export default AdminLayout