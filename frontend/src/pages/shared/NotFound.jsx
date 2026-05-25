import { ArrowLeft, Compass, Home, SearchX } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SiteFooter from '../../components/SiteFooter'
import { useAuth } from '../../context/AuthContext'
import { getHomeRouteForUser } from '../../utils/auth'

const NotFound = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const homeRoute = getHomeRouteForUser(user)
  const missingPath = location.pathname || '/'

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-page-bg)] text-[var(--color-page-text)]">
      <main className="relative flex flex-1 overflow-hidden">
        <div className="absolute inset-0 ui-admin-atmosphere dark:ui-admin-atmosphere-dark" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/70 dark:bg-white/10" aria-hidden="true" />

        <div className="relative mx-auto grid w-full max-w-7xl items-stretch px-5 py-8 sm:px-8 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)] lg:py-12">
          <section className="flex min-h-[34rem] flex-col justify-center py-10 pr-0 lg:pr-12">
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border-muted)] bg-[var(--color-card-surface)]/80 shadow-[var(--shadow-card-sm)]">
              <SearchX className="h-7 w-7 text-[var(--color-role-accent)]" aria-hidden="true" />
            </div>

            <p className="text-sm font-semibold uppercase tracking-normal text-[var(--color-role-accent)]">
              404 / Page not found
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight text-[var(--color-heading)] sm:text-5xl lg:text-6xl">
              This route does not exist in TriLearn.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-text-muted)] sm:text-lg">
              The address may be outdated, mistyped, or unavailable for your current workspace.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to={homeRoute}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--color-role-accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--color-role-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-page-bg)]"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Open home
              </Link>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-card-surface)]/80 px-5 py-3 text-sm font-semibold text-[var(--color-heading)] shadow-sm transition hover:border-[var(--color-role-accent)] hover:text-[var(--color-role-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-role-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-page-bg)]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Go back
              </button>
            </div>

            <div className="mt-12 grid max-w-xl gap-3 text-sm text-[var(--color-text-muted)] sm:grid-cols-2">
              <div className="border-l border-[var(--color-border-muted)] pl-4">
                <span className="block font-semibold text-[var(--color-heading)]">Requested path</span>
                <span className="mt-1 block break-all font-mono text-xs">{missingPath}</span>
              </div>
              <div className="border-l border-[var(--color-border-muted)] pl-4">
                <span className="block font-semibold text-[var(--color-heading)]">Signed in as</span>
                <span className="mt-1 block">{user?.role ? user.role.toLowerCase() : 'guest'}</span>
              </div>
            </div>
          </section>

          <section className="hidden border-l border-[var(--color-border-muted)] bg-[var(--color-card-surface)]/55 px-8 py-10 backdrop-blur lg:flex lg:flex-col lg:justify-center">
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -left-8 top-1/2 h-px w-8 bg-[var(--color-role-accent)]" aria-hidden="true" />
              <div className="mb-8 flex items-center justify-between text-xs font-semibold uppercase tracking-normal text-[var(--color-text-soft)]">
                <span>Navigation map</span>
                <span>Offline branch</span>
              </div>

              <div className="relative min-h-[28rem]">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--color-border-muted)]" aria-hidden="true" />
                <div className="absolute left-10 right-10 top-20 h-px bg-[var(--color-border-muted)]" aria-hidden="true" />
                <div className="absolute left-10 right-10 bottom-24 h-px bg-[var(--color-border-muted)]" aria-hidden="true" />

                <div className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-card-surface)] px-4 py-3 shadow-[var(--shadow-card-sm)]">
                  <Compass className="h-5 w-5 text-[var(--color-role-accent)]" aria-hidden="true" />
                  <span className="text-sm font-semibold text-[var(--color-heading)]">TriLearn</span>
                </div>

                <div className="absolute left-0 top-16 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-card-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-sm">
                  dashboard
                </div>
                <div className="absolute right-0 top-16 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-card-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-sm">
                  profile
                </div>
                <div className="absolute bottom-20 left-0 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-card-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-sm">
                  courses
                </div>
                <div className="absolute bottom-20 right-0 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-card-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-sm">
                  notices
                </div>

                <div className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-role-accent)]/25 bg-[var(--color-role-accent)]/10">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-card-surface)] text-4xl font-black text-[var(--color-role-accent)] shadow-[var(--shadow-card-md)]">
                    404
                  </div>
                </div>

                <div className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 rounded-xl border border-dashed border-[var(--color-role-accent)]/45 bg-[var(--color-role-accent)]/10 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-[var(--color-heading)]">No destination found</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                    Return to a known workspace route to continue.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter compact />
    </div>
  )
}

export default NotFound
