import { Link } from 'react-router-dom'

const buttonVariants = {
  primary: 'cursor-pointer border border-transparent bg-[var(--color-role-accent)] text-white shadow-sm dark:shadow-slate-900/50 hover:brightness-95',
  secondary: 'cursor-pointer border border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 text-slate-600 hover:bg-slate-50',
  danger: 'border border-accent-100 bg-accent-50 text-accent-600 hover:bg-accent-100'
}

const renderAction = (action, index) => {
  const Icon = action.icon
  const classes = `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${buttonVariants[action.variant || 'secondary']}`
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{action.label}</span>
    </>
  )

  if (action.to) {
    return (
      <Link key={action.key || action.label || index} to={action.to} className={classes}>
        {content}
      </Link>
    )
  }

  if (action.href) {
    return (
      <a
        key={action.key || action.label || index}
        href={action.href}
        target={action.target}
        rel={action.rel}
        className={classes}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      key={action.key || action.label || index}
      type={action.type || 'button'}
      onClick={action.onClick}
      disabled={action.disabled}
      className={`${classes} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {content}
    </button>
  )
}

const PageHeader = ({ title, subtitle, actions = [], breadcrumbs = [] }) => (
  <div className="mb-8 flex flex-col gap-5 rounded-[1.6rem] border border-[color:color-mix(in_srgb,var(--color-card-border)_76%,white)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--color-card-surface)_94%,white)_0%,color-mix(in_srgb,var(--color-surface-muted)_88%,white)_100%)] px-5 py-5 shadow-[0_20px_48px_-30px_rgba(15,36,71,0.45)] lg:flex-row lg:items-start lg:justify-between">
    <div className="min-w-0">
      {breadcrumbs.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">
          {breadcrumbs.map((crumb, index) => {
            const label = typeof crumb === 'string' ? crumb : crumb.label
            return (
              <span key={`${label}-${index}`} className="inline-flex items-center gap-2">
                {index > 0 ? <span>/</span> : null}
                {label}
              </span>
            )
          })}
        </div>
      ) : null}
      <h1 className="ui-heading-tight text-2xl font-bold text-[var(--color-heading)] md:text-[1.95rem]">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{subtitle}</p> : null}
    </div>

    {actions.length > 0 ? (
      <div className="flex flex-wrap gap-3">
        {actions.map(renderAction)}
      </div>
    ) : null}
  </div>
)

export default PageHeader
