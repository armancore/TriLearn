import { useLocation, useNavigate } from 'react-router-dom'
import { QrCode, ShieldCheck, UserCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'
import ErrorBoundary from '../components/ErrorBoundary'

const GateLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const sidebarItems = [
    { path: '/gate', label: 'Operations', icon: ShieldCheck, meta: 'Live windows and desk controls' },
    { path: '/gatekeeper', label: 'Student QR', icon: QrCode, meta: 'Direct QR operations route' },
    { label: 'Profile', icon: UserCircle2, meta: 'Desk account', disabled: true }
  ]

  const topItems = [
    { path: '/gate', label: 'Gate Operations', icon: ShieldCheck },
    { path: '/gatekeeper', label: 'Student QR', icon: QrCode }
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppShell
      roleLabel="Gate Operations"
      roleTheme="gate"
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

export default GateLayout
