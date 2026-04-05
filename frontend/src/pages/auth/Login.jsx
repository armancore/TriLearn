import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import BrandLogo from '../../components/BrandLogo'
import { useAuth } from '../../context/AuthContext'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getHomeRouteForUser } from '../../utils/auth'
import { getFriendlyErrorMessage, getRetryAfterSeconds } from '../../utils/errors'

const validateLogin = (values) => {
  const errors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/\S+@\S+\.\S+/.test(values.email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.password) {
    errors.password = 'Password is required'
  }

  return errors
}

const Login = () => {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { values, errors, handleChange, handleSubmit } = useForm({
    email: '',
    password: ''
  }, validateLogin)

  useEffect(() => {
    if (retryCountdown <= 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setRetryCountdown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [retryCountdown])

  const handleLogin = async (formValues) => {
    setLoading(true)
    setError('')

    try {
      const res = await api.post('/auth/login', formValues)
      const { user, token } = res.data
      login(user, token)
      navigate(getHomeRouteForUser(user))
    } catch (err) {
      if (err?.response?.status === 429) {
        setRetryCountdown(getRetryAfterSeconds(err, 60))
      }
      setError(getFriendlyErrorMessage(err, 'Login failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f7f9fc_38%,#edf3f0_100%)] px-4 py-8 text-[var(--color-page-text)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="max-w-xl">
              <BrandLogo theme="light" size="lg" />
              <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-primary shadow-sm">
                <ShieldCheck className="h-4 w-4" />
                <span>Secure academic access</span>
              </p>
              <h1 className="mt-6 text-5xl font-black leading-[1.03] tracking-[-0.05em] text-[var(--color-heading)]">
                Sign in to the academic workspace without the clutter.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-[var(--color-text-muted)]">
                TriLearn brings routine planning, notices, attendance, assignments, and results into one focused
                system for administrators, instructors, coordinators, and students.
              </p>
              <div className="mt-8 grid gap-4">
                {[
                  'Role-based dashboards with focused access',
                  'Clear weekly planning and academic updates',
                  'One secure sign-in for daily campus operations'
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-[var(--color-card-border)] bg-white/72 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-[var(--color-page-text)]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/86 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/88 sm:p-8">
              <div className="lg:hidden">
                <BrandLogo theme="light" size="md" />
              </div>

              <div className="mt-6 lg:mt-0">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--color-text-soft)]">Secure sign in</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[var(--color-heading)]">Welcome back</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-text-muted)]">
                  Use your institutional credentials to continue into your workspace.
                </p>
              </div>

              <div className="mt-6 rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                <p className="text-sm font-medium text-[var(--color-page-text)]">Institution access only</p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  Your dashboard will open automatically based on your assigned role and account permissions.
                </p>
              </div>

              <div className="mt-6">
                <Alert type="error" message={error} />
                {retryCountdown > 0 ? (
                  <Alert
                    type="info"
                    message={`Login is temporarily rate-limited. Please wait ${retryCountdown} second${retryCountdown === 1 ? '' : 's'} before trying again.`}
                  />
                ) : null}
              </div>

              <form onSubmit={handleSubmit(handleLogin)} className="mt-6 space-y-5">
                <div>
                  <label className="ui-form-label">Email</label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-soft)]" />
                    <input
                      name="email"
                      type="email"
                      value={values.email}
                      onChange={handleChange}
                      placeholder="Enter your email"
                      required
                      className={`ui-form-input pl-11 ${errors.email ? 'ui-form-input-error' : ''}`}
                    />
                  </div>
                  {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="ui-form-label mb-0">Password</label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password')}
                      className="text-xs font-medium text-primary transition hover:text-primary"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-soft)]" />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={values.password}
                      onChange={handleChange}
                      placeholder="Enter your password"
                      required
                      className={`ui-form-input px-11 ${errors.password ? 'ui-form-input-error' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--color-text-soft)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-muted)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="ui-form-helper-error">{errors.password}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading || retryCountdown > 0}
                  className="ui-auth-primary-button"
                >
                  {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
                  <span>
                    {loading
                      ? 'Signing you in...'
                      : retryCountdown > 0
                        ? `Try again in ${retryCountdown}s`
                        : 'Login to TriLearn'}
                  </span>
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Login
