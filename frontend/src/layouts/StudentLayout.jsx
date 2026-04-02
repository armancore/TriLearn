import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  Percent,
  UserCircle2,
  Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'

const StudentLayout = ({ children, noticesCount = 4 }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const sidebarItems = useMemo(() => ([
    { path: '/student', label: 'Learnings', icon: BookOpenText, meta: 'Enrolled modules' },
    { path: '/student/assignments', label: 'Tasks', icon: ClipboardList, meta: 'Assignments and deadlines' },
    { path: '/student/attendance', label: 'Attendance', icon: Percent, meta: 'Attendance records' },
    { path: '/student/tickets', label: 'Tickets', icon: FileText, meta: 'Absence explanations' },
    { path: '/student/marks', label: 'Results', icon: FileText, meta: 'Exam results' },
    { path: '/student/materials', label: 'Books', icon: FolderOpen, meta: 'Books and materials' },
    { label: 'Staff Info', icon: Users, meta: 'Faculty contacts', disabled: true },
    { path: '/student/profile', label: 'Profile', icon: UserCircle2, meta: 'My details' },
    { label: 'Fees', icon: CreditCard, meta: 'Billing and payments', disabled: true }
  ]), [])

  const topItems = [
    { path: '/student/routine', label: 'Routine', icon: CalendarDays },
    { path: '/student/notices', label: 'Notices', icon: Bell, badge: noticesCount },
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
      roleLabel="Student Panel"
      roleTheme="student"
      user={user}
      sidebarItems={sidebarItems}
      topItems={topItems}
      activePath={location.pathname}
      onLogout={handleLogout}
    >
      {children}
    </AppShell>
  )
}

export default StudentLayout
