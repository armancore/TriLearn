import { useEffect, useState } from 'react'
import { ArrowRight, Building2, ShieldCheck, UsersRound } from 'lucide-react'
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
  } else if (values.password.length < 6) {
    errors.password = 'Password must be at least 6 characters'
  }

  return errors
}

const Login = () => {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryCountdown, setRetryCountdown] = useState(0)
  const { login } = useAuth()
  const navigate = useNavigate()
  const features = [
    {
      icon: ShieldCheck,
      title: 'Admin command center',
      description: 'Manage departments, notices, and campus operations from one secure control layer.'
    },
    {
      icon: Building2,
      title: 'Instructor workflows',
      description: 'Track attendance, marks, materials, and routines without jumping between disconnected tools.'
    },
    {
      icon: UsersRound,
      title: 'Student-ready experience',
      description: 'Give students one reliable place for classes, notices, submissions, and day-to-day updates.'
    }
  ]
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
    <AuthSplitLayout
      title="One portal for every EduNexus role."
      subtitle="Sign in to manage operations, teach with confidence, and keep students connected to everything happening across campus."
      formTitle="Welcome back"
      formSubtitle="Use your institutional credentials to access your EduNexus workspace."
      features={features}
      footer={(
        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className="font-medium text-blue-600 transition hover:text-blue-700"
        >
          Forgot your password?
        </button>
      )}
    >
      <Alert type="error" message={error} />
      {retryCountdown > 0 ? (
        <Alert
          type="info"
          message={`Login is temporarily rate-limited. Please wait ${retryCountdown} second${retryCountdown === 1 ? '' : 's'} before trying again.`}
        />
      ) : null}

      <form onSubmit={handleSubmit(handleLogin)} className="space-y-5">
        <div>
          <label className="ui-form-label">
            Email
          </label>
          <input
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            placeholder="Enter your email"
            required
            className={`ui-form-input ${errors.email ? 'ui-form-input-error' : ''}`}
          />
          {errors.email && <p className="ui-form-helper-error">{errors.email}</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="ui-form-label mb-0">
              Password
            </label>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-xs font-medium text-blue-600 transition hover:text-blue-700"
            >
              Forgot password?
            </button>
          </div>
          <input
            name="password"
            type="password"
            value={values.password}
            onChange={handleChange}
            placeholder="Enter your password"
            required
            className={`ui-form-input ${errors.password ? 'ui-form-input-error' : ''}`}
          />
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
              ? 'Logging in...'
              : retryCountdown > 0
                ? `Try again in ${retryCountdown}s`
                : 'Login to EduNexus'}
          </span>
        </button>
      </form>
    </AuthSplitLayout>
  )
}

export default Login
