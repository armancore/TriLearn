import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Percent,
  ShieldUser,
  UserCircle2,
  Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
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
    { path: `${basePath}/students`, label: 'Student Stats', icon: Users, meta: 'Student details' },
    { path: `${basePath}/applications`, label: 'Admissions', icon: FileText, meta: 'Application review' },
    { path: `${basePath}/departments`, label: 'Departments', icon: ShieldUser, meta: 'Department setup' },
    { path: `${basePath}/subjects`, label: 'Subjects', icon: BookOpenText, meta: 'Academic setup' },
    { path: `${basePath}/assignments`, label: 'Assignments', icon: ClipboardList, meta: 'Question uploads' },
    { path: `${basePath}/marks`, label: 'Results', icon: Percent, meta: 'Publish exam results' },
    { path: `${basePath}/student-qr`, label: 'Student QR', icon: Percent, meta: 'Gate scan windows' },
    { path: `${basePath}/profile`, label: 'Profile', icon: UserCircle2, meta: 'My account' }
  ]), [])

  if (user?.role === ROLES.COORDINATOR) {
    return <CoordinatorLayout>{children}</CoordinatorLayout>
  }

  const topItems = [
    { path: `${basePath}/routine`, label: 'Routine Setup', icon: CalendarDays },
    { path: `${basePath}/routine/view`, label: 'Routine View', icon: FileText },
    { path: `${basePath}/notices`, label: 'Notices', icon: Bell },
    { path: `${basePath}/applications`, label: 'Admissions', icon: FileText },
    { path: `${basePath}/student-qr`, label: 'QR Slots', icon: Percent }
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
