import BrandLogo from './BrandLogo'

const AuthSplitLayout = ({
  title,
  subtitle,
  formTitle,
  formSubtitle,
  features = [],
  children,
  footer,
  contentWidthClassName = 'max-w-md',
  mainAlign = 'center',
  mainClassName = '',
  cardClassName = '',
  hideAside = false
}) => {
  const alignmentClassName = mainAlign === 'start' ? 'items-start' : 'items-center'

  return (
    <div className="min-h-screen bg-slate-100">
      <div className={`min-h-screen ${hideAside ? '' : 'grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]'}`}>
        {!hideAside ? (
          <aside className="relative overflow-hidden bg-slate-900 px-6 py-10 text-slate-100 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.2),transparent_42%),linear-gradient(160deg,rgba(255,255,255,0.06),transparent_40%)]" />
            <div className="relative z-10">
              <div className="inline-flex rounded-full border border-white/12 bg-[--color-bg-card] px-4 py-2 shadow-lg shadow-slate-950/20 backdrop-blur-sm dark:bg-slate-800/6 dark:shadow-slate-900/50">
                <BrandLogo theme="dark" size="sm" />
              </div>
            </div>

            <div className="relative z-10 mt-12 max-w-xl lg:mt-0">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary-200/90">Unified academic operations</p>
              <h1 className="ui-heading-tight mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                {subtitle}
              </p>

              {features.length ? (
                <div className="mt-10 space-y-4">
                  {features.map((feature) => {
                    const Icon = feature.icon

                    return (
                      <div
                        key={feature.title}
                        className="flex items-start gap-4 rounded-2xl border border-white/10 bg-[--color-bg-card] dark:bg-slate-800/6 px-4 py-4 shadow-xl dark:shadow-slate-900/50 shadow-slate-950/10 backdrop-blur-sm"
                      >
                        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-100 ring-1 ring-white/12">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{feature.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">{feature.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <main className={`flex min-h-screen bg-[var(--color-page-bg)] px-4 py-10 sm:px-8 lg:px-12 ${alignmentClassName} ${mainClassName}`}>
          <div className={`mx-auto w-full ${contentWidthClassName}`}>
            <div className={`ui-card overflow-hidden rounded-[1.75rem] border-[var(--color-card-border)] bg-[var(--color-card-surface)] shadow-[0_28px_70px_-36px_rgba(15,23,42,0.45)] ${cardClassName}`}>
              <div className="border-b border-[var(--color-card-border)] px-6 py-6 sm:px-8">
                <h2 className="ui-heading-tight text-2xl font-semibold text-[var(--color-heading)]">{formTitle}</h2>
                {formSubtitle ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{formSubtitle}</p>
                ) : null}
              </div>

              <div className="px-6 py-6 sm:px-8 sm:py-8">
                {children}
              </div>
            </div>

            {footer ? (
              <div className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
                {footer}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}

export default AuthSplitLayout
