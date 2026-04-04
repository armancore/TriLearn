import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, ClipboardList, FileText, Percent, UserCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'

const GateLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const sidebarItems = [
    { path: '/gate', label: 'Gate Dashboard', icon: Percent, meta: 'Live QR and scan controls' },
    { path: '/gatekeeper', label: 'Student QR', icon: Percent, meta: 'Gatekeeper entry view' },
    { label: 'Profile', icon: UserCircle2, meta: 'My account', disabled: true }
  ]

  const topItems = [
    { label: 'Routine', icon: CalendarDays },
    { label: 'Notices', icon: Bell },
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
      roleLabel="Gatekeeper Console"
      roleTheme="gate"
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

export default GateLayout
