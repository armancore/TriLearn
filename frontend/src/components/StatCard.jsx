const StatCard = ({
  title,
  value,
  icon: Icon,
  iconClassName = '',
  trend = '+4.6%',
  trendLabel = 'from last week'
}) => (
  <article className="ui-card ui-card-hover group overflow-hidden rounded-2xl hover:-translate-y-0.5 hover:shadow-lg dark:shadow-slate-900/50">
    <div className={`h-1.5 w-full bg-gradient-to-r ${iconClassName}`} />
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[var(--color-text)]">{value}</p>
        </div>
        <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg dark:shadow-slate-900/50 transition duration-200 group-hover:-translate-y-0.5 ${iconClassName}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">
          <span>{trend}</span>
          <span>{trendLabel}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
          <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${iconClassName}`} />
        </div>
      </div>
    </div>
  </article>
)

export default StatCard
