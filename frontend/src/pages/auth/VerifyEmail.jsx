import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MailCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const verificationRequests = new Map()

const verifyEmailToken = (token) => {
  if (!verificationRequests.has(token)) {
    verificationRequests.set(
      token,
      api.get(`/auth/verify-email/${encodeURIComponent(token)}`)
    )
  }

  return verificationRequests.get(token)
}

const VerifyEmail = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const features = [
    {
      icon: MailCheck,
      title: 'Confirm account ownership',
      description: 'Verify the email address connected to your TriLearn account.'
    },
    {
      icon: ShieldCheck,
      title: 'Protect account access',
      description: 'Expired or invalid verification links are rejected automatically.'
    },
    {
      icon: Sparkles,
      title: 'Continue to sign in',
      description: 'Once verified, return to login and use the credentials from your email.'
    }
  ]

  useEffect(() => {
    if (!token) {
      setError('Verification link is invalid.')
      setLoading(false)
      return undefined
    }

    let isMounted = true

    verifyEmailToken(token)
      .then((response) => {
        if (!isMounted) return
        setSuccess(response.data.message || 'Email verified successfully.')
      })
      .catch((requestError) => {
        if (!isMounted) return
        setError(getFriendlyErrorMessage(requestError, 'Unable to verify this email address.'))
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [token])

  return (
    <AuthSplitLayout
      title="Verify your TriLearn email address."
      subtitle="This confirmation protects your account before you continue into the portal."
      formTitle="Email verification"
      formSubtitle="TriLearn is checking the verification link from your email."
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

      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm leading-6 text-[var(--color-text-muted)]">
          {loading
            ? 'Verifying your email address...'
            : success || error || 'Verification finished.'}
        </div>

        <button
          type="button"
          onClick={() => navigate('/login')}
          disabled={loading}
          className="ui-auth-primary-button"
        >
          {loading ? <span className="ui-auth-spinner" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" />}
          <span>{loading ? 'Verifying...' : 'Continue to login'}</span>
        </button>
      </div>
    </AuthSplitLayout>
  )
}

export default VerifyEmail
