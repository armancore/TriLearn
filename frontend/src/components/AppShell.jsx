import { Bell, CheckCheck, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, SunMedium } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { resolveFileUrl } from '../utils/api'
import { useTheme } from '../context/ThemeContext'

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

const roleThemeClasses = {
  admin: 'ui-role-accent-admin',
  instructor: 'ui-role-accent-instructor',
  student: 'ui-role-accent-student',
  gate: 'ui-role-accent-gate'
}

const AppShell = ({
  brand = 'EduNexus',
  roleLabel,
  roleTheme = 'admin',
  user,
  sidebarItems,
  topItems = [],
  activePath,
  onLogout,
  children
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const notificationsRef = useRef(null)
  const navigate = useNavigate()
  const { resolvedTheme, toggleTheme } = useTheme()
  const roleThemeClass = roleThemeClasses[roleTheme] || roleThemeClasses.admin
  const isDesktopCollapsed = sidebarCollapsed && !mobileOpen
  const avatarUrl = resolveFileUrl(user?.avatar)

  useEffect(() => {
    let isMounted = true

    const fetchNoticesCount = async () => {
      try {
        const response = await api.get('/notifications', { params: { limit: 8 } })

        if (isMounted) {
          setNotifications(response.data.notifications || [])
          setUnreadCount(response.data.unreadCount || 0)
        }
      } catch {
        if (isMounted) {
          setNotifications([])
          setUnreadCount(0)
        }
      }
    }

    void fetchNoticesCount()
    const intervalId = window.setInterval(() => {
      void fetchNoticesCount()
    }, 30000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [activePath, user?.id])

  useEffect(() => {
    if (!notificationsOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [notificationsOpen])

  const computedTopItems = useMemo(() => (
    topItems.map((item) => {
      if (item.path?.includes('/notices')) {
        return {
          ...item,
          badge: unreadCount > 0 ? unreadCount : null
        }
      }

      return item
    })
  ), [topItems, unreadCount])

  const markNotificationRead = async (notification) => {
    try {
      await api.patch(`/notifications/${notification.id}/read`)
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, isRead: true, readAt: item.readAt || new Date().toISOString() } : item
      )))
      setUnreadCount((current) => Math.max(0, current - (notification.isRead ? 0 : 1)))

      if (notification.link) {
        navigate(notification.link)
        setNotificationsOpen(false)
      }
    } catch {
      // Keep UX quiet for notification interactions.
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Keep UX quiet for notification interactions.
    }
  }

  return (
    <div className={`h-screen overflow-hidden bg-slate-100 text-slate-900 ${roleThemeClass}`} data-role-theme={roleTheme}>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="mx-auto flex h-screen max-w-[1700px] gap-4 p-4 md:gap-6 md:p-6">
        <aside
          className={`ui-sidebar-shell fixed inset-y-4 left-4 z-40 flex h-[calc(100vh-2rem)] w-[260px] flex-col overflow-hidden rounded-[1.75rem] border shadow-sm transition-[width,transform] duration-300 ease-out md:static md:h-[calc(100vh-3rem)] md:translate-x-0 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-[120%]'
          } ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[260px]'}`}
        >
          <div className="border-b border-white/10 px-4 py-4">
            <div className={`flex items-start ${isDesktopCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
              <div className={`flex min-w-0 overflow-hidden ${isDesktopCollapsed ? 'items-center justify-center' : 'items-start gap-3 pr-3'}`}>
                <div className="ui-role-fill flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-black leading-none shadow-[0_18px_40px_rgba(15,23,42,0.28)]">
                EN
                </div>
                <div className={`min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300 ${
                  sidebarCollapsed ? 'max-w-0 translate-x-2 opacity-0' : 'max-w-[160px] opacity-100'
                }`}>
                  <p className="ui-heading-tight truncate text-lg font-bold text-white">{brand}</p>
                  <span className="ui-role-surface ui-role-ring mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    {roleLabel}
                  </span>
                </div>
              </div>

              <div className={`shrink-0 ${isDesktopCollapsed ? 'absolute right-3 top-4' : ''}`}>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  className={`hidden h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-slate-100 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.9)] transition hover:bg-white/14 hover:text-white md:inline-flex ${
                    isDesktopCollapsed ? 'ring-1 ring-white/10' : ''
                  }`}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-slate-100 transition hover:bg-white/14 hover:text-white md:hidden"
                  aria-label="Close sidebar"
                >
                  x
                </button>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-3">
            {sidebarItems.map((item) => {
              const Icon = item.icon
              const isActive = item.path && activePath === item.path

              const content = (
                <div
                  className={`flex rounded-xl border border-transparent transition ${
                    isActive
                      ? isDesktopCollapsed
                        ? 'justify-center bg-white text-[var(--color-role-accent)] shadow-[0_16px_38px_-24px_rgba(15,23,42,0.7)]'
                        : 'items-center gap-3 border-l-4 border-l-[var(--color-role-accent)] bg-white px-3 py-3 text-[var(--color-role-accent)] shadow-[0_16px_38px_-24px_rgba(15,23,42,0.7)]'
                      : item.disabled
                        ? isDesktopCollapsed
                          ? 'justify-center py-3 text-slate-500'
                          : 'items-center gap-3 px-3 py-3 text-slate-500'
                        : isDesktopCollapsed
                          ? 'justify-center py-3 text-slate-200 hover:bg-white/8 hover:text-white'
                          : 'items-center gap-3 px-3 py-3 text-slate-200 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isActive ? 'bg-slate-100' : 'bg-white/8'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className={`min-w-0 flex-1 overflow-hidden transition-[max-width,opacity,transform] duration-300 ${
                    sidebarCollapsed ? 'max-w-0 translate-x-2 opacity-0' : 'max-w-[160px] opacity-100'
                  }`}>
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className={`truncate text-xs ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>{item.meta}</p>
                  </div>
                </div>
              )

              if (item.disabled) {
                return (
                  <button key={item.label} type="button" disabled className={`block w-full cursor-not-allowed ${isDesktopCollapsed ? '' : 'text-left'}`} title={item.label}>
                    {content}
                  </button>
                )
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className="block"
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                >
                  {content}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-white/10 p-3">
            <div className={`mb-3 flex items-center gap-3 rounded-2xl bg-white/8 px-3 py-3 transition ${
              isDesktopCollapsed ? 'justify-center px-2' : ''
            }`}>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${user?.name || 'User'} avatar`}
                  className="h-11 w-11 shrink-0 rounded-full object-cover shadow-[0_16px_36px_rgba(15,23,42,0.28)]"
                />
              ) : (
                <div className="ui-role-fill flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-black leading-none shadow-[0_16px_36px_rgba(15,23,42,0.28)]">
                  {initialsFromName(user?.name)}
                </div>
              )}
              <div className={`min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300 ${
                sidebarCollapsed ? 'max-w-0 translate-x-2 opacity-0' : 'max-w-[150px] opacity-100'
              }`}>
                <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                <p className="truncate text-xs text-slate-300">{user?.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/8 hover:text-white ${
                isDesktopCollapsed ? 'justify-center px-2' : ''
              }`}
              title={sidebarCollapsed ? 'Logout' : undefined}
              aria-label={sidebarCollapsed ? 'Logout' : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ${
                sidebarCollapsed ? 'max-w-0 translate-x-2 opacity-0' : 'max-w-[120px] opacity-100'
              }`}>
                Logout
              </span>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden md:gap-6">
          <header className="ui-card rounded-[1.75rem] px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="rounded-2xl border border-slate-200 p-3 text-slate-600 transition hover:bg-slate-50 md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{roleLabel}</p>
                    <h1 className="ui-heading-tight text-xl font-bold text-slate-900">Workspace</h1>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-600 transition hover:bg-slate-100"
                    aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {resolvedTheme === 'dark' ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>

                  <div ref={notificationsRef} className="relative">
                    <button
                      type="button"
                      onClick={async () => {
                        setNotificationsOpen((open) => !open)
                        if (!notificationsOpen) {
                          setNotificationsLoading(true)
                          try {
                            const response = await api.get('/notifications', { params: { limit: 8 } })
                            setNotifications(response.data.notifications || [])
                            setUnreadCount(response.data.unreadCount || 0)
                          } finally {
                            setNotificationsLoading(false)
                          }
                        }
                      }}
                      className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-600 transition hover:bg-slate-100"
                      aria-label="Open notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      ) : null}
                    </button>

                    {notificationsOpen ? (
                      <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[340px] rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Notifications</p>
                            <p className="text-xs text-slate-500">{unreadCount} unread</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void markAllNotificationsRead()
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            <span>Mark all</span>
                          </button>
                        </div>

                        {notificationsLoading ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading notifications...</div>
                        ) : notifications.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">No notifications yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {notifications.map((notification) => (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => {
                                  void markNotificationRead(notification)
                                }}
                                className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                                  notification.isRead
                                    ? 'border-slate-200 bg-white'
                                    : 'border-amber-200 bg-amber-50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">{notification.message}</p>
                                  </div>
                                  {!notification.isRead ? (
                                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 shadow-sm">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                  </div>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`${user?.name || 'User'} avatar`}
                      className="h-10 w-10 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="ui-role-fill flex h-10 w-10 items-center justify-center rounded-2xl text-[13px] font-black leading-none text-white">
                      {initialsFromName(user?.name)}
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {computedTopItems.map((item) => {
                  const Icon = item.icon
                  const isActive = item.path && activePath === item.path

                  if (!item.path) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        disabled
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </button>
                    )
                  }

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        isActive
                          ? 'border-[var(--color-role-accent)] bg-[var(--color-role-accent)] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      {item.badge ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isActive ? 'bg-white/15 text-white' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-y-auto pr-1">{children}</main>
        </div>
      </div>
    </div>
  )
}

export default AppShell
