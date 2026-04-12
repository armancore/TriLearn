import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
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
  const features = [
    {
      icon: ShieldCheck,
      title: 'Secure academic access',
      description: 'Role-based dashboards stay focused for administrators, coordinators, instructors, and students.'
    },
    {
      icon: Building2,
      title: 'Cleaner daily workflow',
      description: 'Open notices, attendance, assignments, results, and routine planning from one academic workspace.'
    },
    {
      icon: KeyRound,
      title: 'Institution-first sign in',
      description: 'Your dashboard opens automatically based on your assigned role and account permissions.'
    }
  ]

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
    if (loading || retryCountdown > 0) {
      return
    }

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
    <AuthSplitLayout
      title="Sign in to the academic workspace without the clutter."
      subtitle="TriLearn brings routine planning, notices, attendance, assignments, and results into one focused system for administrators, instructors, coordinators, and students."
      formTitle="Welcome back"
      formSubtitle="Use your institutional credentials to continue into your workspace."
      features={features}
      contentWidthClassName="max-w-xl"
      cardClassName="rounded-[2rem]"
    >
      <div className="rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
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
    </AuthSplitLayout>
  )
}

export default Login
