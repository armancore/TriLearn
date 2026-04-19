import { useState } from 'react'
import { ArrowRight, KeyRound, MailCheck, ShieldEllipsis } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import FormInput from '../../components/common/FormInput'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const features = [
    {
      icon: KeyRound,
      title: 'Recover access quickly',
      description: 'Start the reset flow with the email linked to your TriLearn profile.'
    },
    {
      icon: ShieldEllipsis,
      title: 'Security-first flow',
      description: 'Reset access without exposing role permissions, account details, or admin-only controls.'
    },
    {
      icon: MailCheck,
      title: 'Ready for delivery',
      description: 'The page is already prepared for live reset emails once mail delivery is connected.'
    }
  ]
  const { values, errors, handleChange, handleSubmit } = useForm({ email: '' }, (formValues) => {
    const validationErrors = {}
    if (!formValues.email.trim()) validationErrors.email = 'Email is required'
    return validationErrors
  })

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError('')
      setSuccess('')
      const res = await api.post('/auth/forgot-password', values)
      setSuccess(res.data.message)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to start password reset.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout
      title="Reset account access without the usual friction."
      subtitle="TriLearn keeps the reset flow simple for students, instructors, and admins while staying ready for secure email delivery."
      formTitle="Forgot password"
      formSubtitle="Enter your personal or institutional email address to begin the password reset flow."
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
          label="Email Address"
          name="email"
          type="email"
          value={values.email}
          onChange={handleChange}
          placeholder="Enter your email"
          error={errors.email}
        />
        <button
          type="submit"
          disabled={loading}
          className="ui-auth-primary-button"
        >
          {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
          <span>{loading ? 'Preparing reset...' : 'Send reset link'}</span>
        </button>
      </form>
    </AuthSplitLayout>
  )
}

export default ForgotPassword
