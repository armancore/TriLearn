import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BookMarked,
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
import AppShell from '../components/AppShell'
import ErrorBoundary from '../components/ErrorBoundary'

const CoordinatorLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const basePath = '/coordinator'

  const sidebarItems = useMemo(() => ([
    { path: `${basePath}`, label: 'Dashboard', icon: LayoutDashboard, meta: 'Overview' },
    { path: `${basePath}/users`, label: 'People', icon: Users, meta: 'Campus user management' },
    { path: `${basePath}/students`, label: 'Student Stats', icon: Users, meta: 'Student details' },
    { path: `${basePath}/applications`, label: 'Admissions', icon: FileText, meta: 'Applications' },
    { path: `${basePath}/departments`, label: 'Departments', icon: ShieldUser, meta: 'Department setup' },
    { path: `${basePath}/subjects`, label: 'Subjects', icon: BookOpenText, meta: 'Academic setup' },
    { path: `${basePath}/student-qr`, label: 'Student QR', icon: Percent, meta: 'Gate scan windows' },
    { path: `${basePath}/attendance`, label: 'Attendance', icon: Percent, meta: 'Campus attendance view' },
    { path: `${basePath}/assignments`, label: 'Assignments', icon: ClipboardList, meta: 'Task tracking' },
    { path: `${basePath}/marks`, label: 'Results', icon: FileText, meta: 'Assessment data' },
    { path: `${basePath}/materials`, label: 'Materials', icon: BookMarked, meta: 'Learning resources' },
    { path: `${basePath}/profile`, label: 'Profile', icon: UserCircle2, meta: 'My account' }
  ]), [])

  const topItems = [
    { path: `${basePath}/routine`, label: 'Routine Setup', icon: CalendarDays },
    { path: `${basePath}/routine/view`, label: 'Routine View', icon: FileText },
    { path: `${basePath}/notices`, label: 'Notices', icon: Bell },
    { path: `${basePath}/requests`, label: 'Requests', icon: ClipboardList },
    { path: `${basePath}/applications`, label: 'Admissions', icon: FileText },
    { path: `${basePath}/materials`, label: 'Materials', icon: BookMarked }
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppShell
      roleLabel="Coordinator Panel"
      roleTheme="coordinator"
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

export default CoordinatorLayout
