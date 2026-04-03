import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  Menu,
  Sparkles,
  SunMedium
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { resolveFileUrl } from '../utils/api'

const topItems = [
  { key: 'routine', label: 'Routine', icon: CalendarDays },
  { key: 'notices', label: 'Notices', icon: Bell },
  { key: 'events', label: 'Events', icon: Sparkles },
  { key: 'requests', label: 'Requests', icon: ClipboardList },
  { key: 'keyDates', label: 'Key Dates', icon: CalendarDays },
  { key: 'survey', label: 'Survey', icon: FileText },
  { key: 'weekly', label: 'Weekly', icon: SunMedium }
]

const initialsFromName = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ST'

const TopNav = ({ user, noticesCount = 0, links = {}, onOpenSidebar, onLogout }) => {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const avatarUrl = resolveFileUrl(user?.avatar)

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="rounded-2xl border border-white/10 bg-white/8 p-3 text-slate-100 transition hover:bg-white/14 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-200/80">Student Workspace</p>
              <h1 className="text-xl font-black tracking-tight text-white md:text-2xl">My Learnings</h1>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-left text-white transition hover:bg-white/14"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${user?.name || 'User'} avatar`}
                  className="h-11 w-11 rounded-2xl object-cover shadow-[0_16px_45px_rgba(79,70,229,0.35)]"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8b5cf6_0%,#2563eb_100%)] text-sm font-black shadow-[0_16px_45px_rgba(79,70,229,0.35)]">
                  {initialsFromName(user?.name)}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{user?.name || 'Student User'}</p>
                <p className="text-xs text-slate-300">{user?.email || 'student@edunexus.edu'}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-300" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-64 rounded-[1.5rem] border border-white/10 bg-slate-950/88 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                >
                  <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-sm font-semibold text-white">{user?.name || 'Student User'}</p>
                    <p className="mt-1 text-xs text-slate-400">{user?.email || 'student@edunexus.edu'}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-violet-200/70">Student Account</p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <Link
                      to="/student/profile"
                      onClick={() => setMenuOpen(false)}
                      className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                    >
                      Open Profile
                    </Link>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-left text-sm text-rose-200 transition hover:bg-rose-500/16"
                    >
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {topItems.map((item) => {
            const Icon = item.icon
            const path = links[item.key]
            const isActive = path && location.pathname === path
            const badgeCount = item.key === 'notices' ? noticesCount : null

            if (!path) {
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-dashed border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-400"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              )
            }

            return (
              <Link
                key={item.key}
                to={path}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'border-violet-400/40 bg-[linear-gradient(135deg,rgba(139,92,246,0.32)_0%,rgba(37,99,235,0.26)_100%)] text-white shadow-[0_16px_34px_rgba(76,29,149,0.22)]'
                    : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.09]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {badgeCount ? (
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {badgeCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TopNav
