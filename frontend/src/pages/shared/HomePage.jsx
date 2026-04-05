import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  FileBarChart2,
  GraduationCap,
  LayoutPanelTop,
  Layers3,
  ShieldCheck,
  TimerReset,
  Users2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandLogo from '../../components/BrandLogo'

const platformPillars = [
  {
    title: 'Academic Operations',
    description: 'Keep routines, notices, attendance, assignments, and results aligned in one dependable workflow.',
    icon: Layers3
  },
  {
    title: 'Role-Focused Experience',
    description: 'Administrators, coordinators, instructors, gate staff, and students each see the workspace they actually need.',
    icon: LayoutPanelTop
  },
  {
    title: 'Institutional Reliability',
    description: 'Designed for everyday campus use with clear access control, stable workflows, and less operational friction.',
    icon: ShieldCheck
  }
]

const workflowMoments = [
  {
    eyebrow: 'Plan',
    title: 'Build the academic week with clarity',
    description: 'Publish Sunday-first routines, align departments, and keep teaching schedules visible from the first working hour.',
    icon: CalendarClock
  },
  {
    eyebrow: 'Run',
    title: 'Handle daily classroom operations without noise',
    description: 'Track attendance, share materials, manage assignments, and reduce back-and-forth between disconnected tools.',
    icon: TimerReset
  },
  {
    eyebrow: 'Close',
    title: 'Report outcomes with confidence',
    description: 'Review marks, publish results, and maintain a cleaner academic record at the end of each cycle.',
    icon: FileBarChart2
  }
]

const outcomeStats = [
  { value: '5', label: 'role-aware workspaces' },
  { value: '1', label: 'shared academic control center' },
  { value: 'Sun', label: 'weekly routine starts visibly' },
  { value: '24/7', label: 'student access to updates and records' }
]

const trustPoints = [
  'Structured notices and assignment follow-through',
  'Attendance and result workflows in the same system',
  'Department-level visibility without admin overload',
  'Professional experience for both staff and students'
]

const HomePage = () => (
  <div className="ui-homepage-gradient min-h-screen text-[var(--color-page-text)]">
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(84,131,195,0.18),transparent_44%),radial-gradient(circle_at_top_right,rgba(244,166,35,0.12),transparent_34%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(84,131,195,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(42,82,152,0.16),transparent_34%)]" />

      <header className="sticky top-0 z-30 border-b border-white/55 bg-white/72 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/66">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <BrandLogo theme="light" size="md" />
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-[var(--color-card-border)] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:bg-slate-900/70 dark:text-slate-300 md:inline-flex">
              Campus Academic OS
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-heading)] px-5 py-2.5 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:bg-slate-800"
            >
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative mx-auto max-w-7xl px-6 pb-16 pt-12 lg:px-10 lg:pb-24 lg:pt-18">
          <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200/80 bg-white/84 px-4 py-2 text-sm font-semibold text-primary shadow-[0_16px_34px_rgba(15,23,42,0.06)] dark:border-primary-700/30 dark:bg-slate-900/70 dark:text-primary-300">
                <BookOpenCheck className="h-4 w-4" />
                <span>Professional academic management for modern institutions</span>
              </div>

              <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.96] tracking-[-0.06em] text-[var(--color-heading)] sm:text-5xl lg:text-[5.2rem]">
                A polished academic workspace for planning, teaching, communication, and results.
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-[var(--color-text-muted)] sm:text-lg">
                TriLearn brings routine planning, attendance, assignments, materials, notices, and marks into one
                operational system that feels organized for staff and dependable for students.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-[0_20px_36px_-20px_rgba(42,82,152,0.72)] transition hover:translate-y-[-1px] hover:bg-primary-700"
                >
                  <span>Enter the Platform</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-card-border)] bg-white/70 px-6 py-3.5 text-sm font-medium text-[var(--color-text-muted)] shadow-[0_14px_30px_rgba(15,23,42,0.05)] dark:bg-slate-900/60">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Secure role-based access across the full campus workflow</span>
                </div>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {outcomeStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[1.6rem] border border-[var(--color-card-border)] bg-white/74 px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:bg-slate-900/62"
                  >
                    <p className="text-3xl font-black tracking-tight text-[var(--color-heading)]">{stat.value}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:pl-4">
              <div className="rounded-[2.2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#081326_0%,#0e1e36_46%,#132640_100%)] p-6 text-white shadow-[0_34px_90px_rgba(15,23,42,0.18)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <BrandLogo theme="dark" size="sm" />
                    <p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">
                      Daily academic control with a cleaner overview of teaching activity, departmental coordination, and student-facing updates.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                    Live Workflow
                  </span>
                </div>

                <div className="mt-7 grid gap-4">
                  <div className="rounded-[1.7rem] border border-white/10 bg-white/6 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Academic rhythm</p>
                        <h2 className="mt-2 text-xl font-bold text-white">One structured workspace from routine to result publication</h2>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3 text-slate-100">
                        <GraduationCap className="h-5 w-5" />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-primary/20 p-3 text-primary-200">
                          <BellRing className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Live communication</p>
                          <p className="mt-1 text-xs leading-6 text-slate-300">Notices, updates, and daily signals stay visible.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-emerald-400/16 p-3 text-emerald-200">
                          <Users2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">Department aware</p>
                          <p className="mt-1 text-xs leading-6 text-slate-300">Built for coordinators, instructors, and student cohorts.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.7rem] border border-white/10 bg-white/6 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">What the platform keeps aligned</p>
                    <div className="mt-4 space-y-3">
                      {trustPoints.map((point) => (
                        <div key={point} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                          <p className="text-sm leading-6 text-slate-200">{point}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-3">
            {platformPillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <article
                  key={pillar.title}
                  className="rounded-[1.8rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-7 shadow-[0_22px_48px_rgba(15,23,42,0.05)] transition hover:translate-y-[-2px] hover:shadow-[0_28px_60px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-[var(--color-heading)]">{pillar.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-text-muted)]">{pillar.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-18">
          <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Operational flow</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[var(--color-heading)] sm:text-4xl">
                Built around how academic teams actually work during the week.
              </h2>
              <p className="mt-4 text-base leading-8 text-[var(--color-text-muted)]">
                The homepage now speaks to institutional confidence: predictable planning, cleaner teaching operations,
                and better visibility for students without turning the experience into a cluttered admin dashboard.
              </p>
            </div>

            <div className="grid gap-5">
              {workflowMoments.map((moment) => {
                const Icon = moment.icon
                return (
                  <article
                    key={moment.title}
                    className="rounded-[1.8rem] border border-[var(--color-card-border)] bg-white/70 p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:bg-slate-900/55"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                      <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-[1.15rem] bg-[var(--color-surface-muted)] text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-soft)]">{moment.eyebrow}</p>
                        <h3 className="mt-2 text-xl font-bold text-[var(--color-heading)]">{moment.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-[var(--color-text-muted)]">{moment.description}</p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
          <div className="rounded-[2rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.06)] sm:px-8 lg:px-10 lg:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Ready for daily use</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[var(--color-heading)]">
                  Give staff and students a homepage that feels as professional as the platform behind it.
                </h2>
                <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                  TriLearn is positioned here as a serious academic operations product: calm, structured, and ready for institutional rollout.
                </p>
              </div>

              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-[0_20px_36px_-20px_rgba(42,82,152,0.72)] transition hover:translate-y-[-1px] hover:bg-primary-700"
              >
                <span>Go to Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
)

export default HomePage
