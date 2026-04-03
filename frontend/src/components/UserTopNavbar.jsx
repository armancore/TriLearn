import { Link, useLocation } from 'react-router-dom'
import { resolveFileUrl } from '../utils/api'

const navItems = [
  { key: 'learnings', label: 'Learnings' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'results', label: 'Results' },
  { key: 'books', label: 'Books' },
  { key: 'profile', label: 'Profile' },
  { key: 'allResults', label: 'All Results' }
]

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

const UserTopNavbar = ({
  user,
  title = 'Campus Navigation',
  subtitle = 'Quick access to the main academic sections.',
  institutionLabel = 'Sunway College',
  links = {},
  accent = 'emerald'
}) => {
  const location = useLocation()
  const avatarUrl = resolveFileUrl(user?.avatar)

  const accentStyles = {
    emerald: {
      shell: 'border-emerald-200 bg-white/90',
      icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      active: 'border-emerald-700 bg-emerald-700 text-white shadow-[0_12px_30px_rgba(5,150,105,0.16)]',
      idle: 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700',
      profile: 'from-emerald-600 to-emerald-800 text-white',
      badge: 'bg-emerald-50 text-emerald-700'
    },
    blue: {
      shell: 'border-blue-200 bg-white/90',
      icon: 'border-blue-200 bg-blue-50 text-blue-700',
      active: 'border-blue-700 bg-blue-700 text-white shadow-[0_12px_30px_rgba(29,78,216,0.16)]',
      idle: 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700',
      profile: 'from-blue-600 to-blue-800 text-white',
      badge: 'bg-blue-50 text-blue-700'
    },
    purple: {
      shell: 'border-purple-200 bg-white/90',
      icon: 'border-purple-200 bg-purple-50 text-purple-700',
      active: 'border-purple-700 bg-purple-700 text-white shadow-[0_12px_30px_rgba(126,34,206,0.16)]',
      idle: 'border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:text-purple-700',
      profile: 'from-purple-600 to-purple-800 text-white',
      badge: 'bg-purple-50 text-purple-700'
    },
    amber: {
      shell: 'border-amber-200 bg-white/90',
      icon: 'border-amber-200 bg-amber-50 text-amber-700',
      active: 'border-amber-600 bg-amber-600 text-white shadow-[0_12px_30px_rgba(217,119,6,0.18)]',
      idle: 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:text-amber-700',
      profile: 'from-amber-500 to-amber-700 text-white',
      badge: 'bg-amber-50 text-amber-700'
    }
  }

  const styles = accentStyles[accent] || accentStyles.emerald

  return (
    <div className="px-4 pt-4 md:px-6 lg:px-8">
      <div className={`rounded-[1.9rem] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur ${styles.shell}`}>
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${user?.name || 'User'} avatar`}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-black tracking-[0.18em] ${styles.profile}`}>
                {getInitials(user?.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-lg font-black tracking-tight text-slate-900">{title}</p>
              <p className="truncate text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] ${styles.badge}`}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black ${styles.icon}`}>
                SC
              </span>
              <span>{institutionLabel}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user?.name || 'User'}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{user?.role || 'Member'}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const path = links[item.key]
            const isActive = path && location.pathname === path

            if (!path) {
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled
                  className="flex min-w-[150px] shrink-0 items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-left text-slate-400"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-[11px] font-black tracking-[0.16em]">
                    SC
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{item.label}</span>
                    <span className="text-[11px] uppercase tracking-[0.18em]">Soon</span>
                  </span>
                </button>
              )
            }

            return (
              <Link
                key={item.key}
                to={path}
                className={`flex min-w-[150px] shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 transition ${isActive ? styles.active : styles.idle}`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl border text-[11px] font-black tracking-[0.16em] ${isActive ? 'border-white/20 bg-white/15 text-white' : styles.icon}`}>
                  SC
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className={`text-[11px] uppercase tracking-[0.18em] ${isActive ? 'text-white/75' : 'text-slate-400'}`}>
                    Open
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default UserTopNavbar
