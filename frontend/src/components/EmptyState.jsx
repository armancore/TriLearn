import { Inbox } from 'lucide-react'

const EmptyState = ({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description = 'There is no data to show right now.',
  action
}) => (
  <div className="rounded-3xl border border-dashed border-[var(--color-card-border)] bg-[linear-gradient(135deg,var(--color-card-surface)_0%,var(--color-surface-muted)_100%)] px-6 py-12 text-center shadow-sm dark:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-card-surface)_90%,black)_0%,color-mix(in_srgb,var(--color-surface-muted)_84%,black)_100%)] dark:shadow-slate-900/50">
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] shadow-sm dark:shadow-slate-900/50">
      <Icon className="h-8 w-8 text-[var(--color-role-accent)]" />
    </div>
    <h3 className="text-lg font-semibold text-[var(--color-heading)]">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
)

export default EmptyState
