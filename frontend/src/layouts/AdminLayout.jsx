import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Percent,
  ShieldUser,
  UserCircle2,
  Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'
import CoordinatorLayout from './CoordinatorLayout'
import ErrorBoundary from '../components/ErrorBoundary'

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const basePath = '/admin'

  const sidebarItems = useMemo(() => ([
    { path: `${basePath}`, label: 'Dashboard', icon: LayoutDashboard, meta: 'Overview' },
    { path: `${basePath}/users`, label: 'Users', icon: Users, meta: 'People and roles' },
    { path: `${basePath}/applications`, label: 'Admissions', icon: FileText, meta: 'Application review' },
    { path: `${basePath}/departments`, label: 'Departments', icon: ShieldUser, meta: 'Department setup' },
    { path: `${basePath}/subjects`, label: 'Subjects', icon: BookOpenText, meta: 'Academic setup' },
    { path: `${basePath}/student-qr`, label: 'Student QR', icon: Percent, meta: 'Gate scan windows' },
    { path: `${basePath}/profile`, label: 'Profile', icon: UserCircle2, meta: 'My account' }
  ]), [])

  if (user?.role === 'COORDINATOR') {
    return <CoordinatorLayout>{children}</CoordinatorLayout>
  }

  const topItems = [
    { path: `${basePath}/routine`, label: 'Routine', icon: CalendarDays },
    { path: `${basePath}/notices`, label: 'Notices', icon: Bell },
    { label: 'Events', icon: CalendarDays },
    { label: 'Requests', icon: ClipboardList },
    { label: 'Key Dates', icon: CalendarDays },
    { label: 'Survey', icon: FileText },
    { label: 'Weekly', icon: Bell }
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppShell
      roleLabel="Admin Panel"
      roleTheme="admin"
      user={user}
      sidebarItems={sidebarItems}
      topItems={topItems}
      activePath={location.pathname}
      onLogout={handleLogout}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}

export default AdminLayout
