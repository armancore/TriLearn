import { AnimatePresence, motion } from 'framer-motion'
import { GraduationCap, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Link } from 'react-router'

const Sidebar = ({
  items,
  currentPath,
  isDesktopCollapsed,
  isMobileOpen,
  onDesktopToggle,
  onMobileClose
}) => {
  const sidebarBody = (
    <div className="flex h-full flex-col rounded-[2rem] border border-white/10 bg-[--color-bg-card] dark:bg-slate-800/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between rounded-[1.5rem] border border-white/10 bg-[--color-bg-card] dark:bg-slate-800/8 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6d28d9_0%,#312e81_100%)] shadow-[0_18px_45px_rgba(109,40,217,0.35)]">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          {!isDesktopCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.28em] text-primary-200/80">
                TriLearn
              </p>
              <p className="truncate text-lg font-black tracking-tight text-white">Student Hub</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDesktopToggle}
          className="hidden rounded-2xl border border-white/10 bg-[--color-bg-card] dark:bg-slate-800/8 p-2 text-slate-200 transition hover:bg-[--color-bg-card] dark:bg-slate-800/15 md:block"
          aria-label={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isDesktopCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-2">
        {items.map((item, index) => {
          const Icon = item.icon
          const isActive = currentPath === item.path
          const itemClasses = isActive
            ? 'border-primary-400/40 bg-[linear-gradient(135deg,rgba(139,92,246,0.35)_0%,rgba(37,99,235,0.28)_100%)] text-white shadow-[0_18px_40px_rgba(76,29,149,0.28)]'
            : item.disabled
              ? 'border-white/5 bg-[--color-bg-card] dark:bg-slate-800/[0.03] text-slate-500'
              : 'border-white/6 bg-[--color-bg-card] dark:bg-slate-800/[0.05] text-slate-200 hover:border-primary-300/20 hover:bg-[--color-bg-card] dark:bg-slate-800/[0.09]'

          const content = (
            <div className={`group flex items-center gap-3 rounded-[1.35rem] border px-3 py-3.5 transition duration-300 ${itemClasses}`}>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isActive ? 'bg-[--color-bg-card] dark:bg-slate-800/16 text-white' : 'bg-slate-950/30 text-primary-200'}`}>
                <Icon className="h-5 w-5" />
              </div>
              {!isDesktopCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.label}</p>
                  <p className={`truncate text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                    {item.meta}
                  </p>
                </div>
              )}
              {!isDesktopCollapsed && item.badge && (
                <span className="rounded-full bg-[--color-bg-card] dark:bg-slate-800/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">
                  {item.badge}
                </span>
              )}
            </div>
          )

          if (item.disabled) {
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <button type="button" disabled className="block w-full cursor-not-allowed text-left">
                  {content}
                </button>
              </motion.div>
            )
          }

          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Link to={item.path} onClick={onMobileClose} className="block">
                {content}
              </Link>
            </motion.div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      <aside className={`hidden h-[calc(100vh-2rem)] shrink-0 md:block ${isDesktopCollapsed ? 'w-28' : 'w-80'}`}>
        {sidebarBody}
      </aside>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close sidebar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="fixed inset-y-4 left-4 z-50 w-[min(82vw,20rem)] md:hidden"
            >
              {sidebarBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default Sidebar
