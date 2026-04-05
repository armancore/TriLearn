import { motion } from 'framer-motion'

const StatsStrip = ({ items }) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {items.map((item, index) => {
      const Icon = item.icon

      return (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: index * 0.06 }}
          whileHover={{ y: -4 }}
          className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-4 shadow-sm dark:shadow-slate-900/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-text-muted)]">{item.label}</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-[var(--color-heading)]">{item.value}</p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{item.help}</p>
            </div>
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} shadow-[0_16px_40px_rgba(0,0,0,0.22)]`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>
      )
    })}
  </div>
)

export default StatsStrip
