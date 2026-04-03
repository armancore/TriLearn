const EmptyState = ({
  icon = '📭',
  title = 'Nothing here yet',
  description = 'There is no data to show right now.',
  action
}) => (
  <div className="rounded-3xl border border-dashed border-slate-300 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-card-surface)_88%,white_12%)_0%,color-mix(in_srgb,var(--color-surface-muted)_92%,white_8%)_100%)] px-6 py-12 text-center shadow-sm">
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-[var(--color-card-surface)] text-3xl shadow-sm">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
)

export default EmptyState
