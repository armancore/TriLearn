import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [devResetUrl, setDevResetUrl] = useState('')
  const [loading, setLoading] = useState(false)
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
      setDevResetUrl('')
      const res = await api.post('/auth/forgot-password', values)
      setSuccess(res.data.message)
      if (res.data.resetUrl) {
        setDevResetUrl(res.data.resetUrl)
      }
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to start password reset.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Forgot Password</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your email and we&apos;ll prepare a reset link.</p>
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
        {devResetUrl ? (
          <Alert type="info" message={`Development reset link: ${devResetUrl}`} />
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            placeholder="Enter your email"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.email ? <p className="text-xs text-red-600">{errors.email}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Preparing reset...' : 'Send Reset Link'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          Back to login
        </button>
      </div>
    </div>
  )
}

export default ForgotPassword
