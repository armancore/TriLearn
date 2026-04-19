import { useMemo, useState } from 'react'
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import FormInput from '../../components/common/FormInput'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ResetPassword = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const features = [
    {
      icon: ShieldCheck,
      title: 'Verified reset session',
      description: 'Use the secure password reset link from your email to set a fresh password.'
    },
    {
      icon: KeyRound,
      title: 'Strong credential update',
      description: 'Your previous password is immediately replaced once this reset is submitted.'
    },
    {
      icon: LockKeyhole,
      title: 'Redirects safely',
      description: 'After success, you are sent back to login to continue with your updated credentials.'
    }
  ]
  const { values, errors, handleChange, handleSubmit } = useForm({
    password: '',
    confirmPassword: ''
  }, (formValues) => {
    const validationErrors = {}
    if (!formValues.password) validationErrors.password = 'New password is required'
    if (formValues.password.length < 8) validationErrors.password = 'Use at least 8 characters'
    if (formValues.password !== formValues.confirmPassword) validationErrors.confirmPassword = 'Passwords do not match'
    return validationErrors
  })

  const onSubmit = async () => {
    if (!token) {
      setError('Password reset link is invalid.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const res = await api.post('/auth/reset-password', {
        token,
        password: values.password
      })
      setSuccess(res.data.message)
      setTimeout(() => navigate('/login'), 1500)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to reset your password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      title="Set a new password and get back to class-ready access."
      subtitle="This reset screen updates your credentials securely and redirects you to sign in again."
      formTitle="Reset password"
      formSubtitle="Choose a new password for your account."
      features={features}
      footer={(
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-heading)]"
        >
          Back to login
        </button>
      )}
    >
      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <FormInput
          label="New Password"
          name="password"
          type="password"
          value={values.password}
          onChange={handleChange}
          placeholder="Create a new password"
          error={errors.password}
        />
        <FormInput
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={handleChange}
          placeholder="Confirm new password"
          error={errors.confirmPassword}
        />
        <button
          type="submit"
          disabled={loading}
          className="ui-auth-primary-button"
        >
          {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
          <span>{loading ? 'Resetting...' : 'Reset Password'}</span>
        </button>
      </form>
    </AuthSplitLayout>
  )
}

export default ResetPassword
