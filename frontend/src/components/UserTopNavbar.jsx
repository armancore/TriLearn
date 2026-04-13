import { Link, useLocation } from 'react-router-dom'
import useProtectedObjectUrl from '../hooks/useProtectedObjectUrl'

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
  const avatarUrl = useProtectedObjectUrl(user?.avatar)

  const accentStyles = {
    emerald: {
      shell: 'border-primary-200 bg-[var(--color-card-surface)] dark:border-primary-700/30',
      icon: 'border-primary-200 bg-primary-50 text-primary dark:border-primary-700/30 dark:bg-primary-950/30 dark:text-primary-300',
      active: 'border-primary-700 bg-primary text-white shadow-[0_12px_30px_rgba(26,60,110,0.16)]',
      idle: 'border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-page-text)] hover:border-primary-300 hover:text-primary',
      profile: 'from-emerald-600 to-emerald-800 text-white',
      badge: 'bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300'
    },
    blue: {
      shell: 'border-primary-200 bg-[var(--color-card-surface)] dark:border-primary-700/30',
      icon: 'border-primary-200 bg-primary-50 text-primary dark:border-primary-700/30 dark:bg-primary-950/30 dark:text-primary-300',
      active: 'border-primary-700 bg-primary text-white shadow-[0_12px_30px_rgba(29,78,216,0.16)]',
      idle: 'border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-page-text)] hover:border-primary-300 hover:text-primary',
      profile: 'from-blue-600 to-blue-800 text-white',
      badge: 'bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300'
    },
    purple: {
      shell: 'border-primary-200 bg-[var(--color-card-surface)] dark:border-primary-700/30',
      icon: 'border-primary-200 bg-primary-50 text-primary dark:border-primary-700/30 dark:bg-primary-950/30 dark:text-primary-300',
      active: 'border-primary-700 bg-primary-700 text-white shadow-[0_12px_30px_rgba(126,34,206,0.16)]',
      idle: 'border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-page-text)] hover:border-primary-300 hover:text-primary',
      profile: 'from-purple-600 to-purple-800 text-white',
      badge: 'bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300'
    },
    amber: {
      shell: 'border-accent-200 bg-[var(--color-card-surface)] dark:border-accent-700/30',
      icon: 'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-700/30 dark:bg-accent-950/30 dark:text-accent-300',
      active: 'border-accent-600 bg-accent-600 text-white shadow-[0_12px_30px_rgba(212,137,26,0.18)]',
      idle: 'border-[var(--color-card-border)] bg-[var(--color-card-surface)] text-[var(--color-page-text)] hover:border-accent-300 hover:text-accent-700',
      profile: 'from-amber-500 to-amber-700 text-white',
      badge: 'bg-accent-50 text-accent-700 dark:bg-accent-950/30 dark:text-accent-300'
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
              <p className="text-lg font-black tracking-tight text-[var(--color-heading)]">{title}</p>
              <p className="truncate text-sm text-[var(--color-text-muted)]">{subtitle}</p>
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
              <p className="text-sm font-semibold text-[var(--color-heading)]">{user?.name || 'User'}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{user?.role || 'Member'}</p>
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
                  className="flex min-w-[150px] shrink-0 items-center gap-3 rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-left text-[var(--color-text-soft)]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-[--color-bg-card] dark:bg-slate-800 text-[11px] font-black tracking-[0.16em]">
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
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl border text-[11px] font-black tracking-[0.16em] ${isActive ? 'border-white/20 bg-[--color-bg-card] dark:bg-slate-800/15 text-white' : styles.icon}`}>
                  SC
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className={`text-[11px] uppercase tracking-[0.18em] ${isActive ? 'text-white/75' : 'text-[var(--color-text-soft)]'}`}>
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
