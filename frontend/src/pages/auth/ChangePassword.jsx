import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import { useAuth } from '../../context/AuthContext'
import useForm from '../../hooks/useForm'
import api from '../../utils/api'
import { getHomeRouteForUser } from '../../utils/auth'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ChangePassword = () => {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { values, errors, handleChange, handleSubmit } = useForm({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  }, (formValues) => {
    const validationErrors = {}
    if (!formValues.currentPassword) validationErrors.currentPassword = 'Current password is required'
    if (!formValues.newPassword) validationErrors.newPassword = 'New password is required'
    if (formValues.newPassword !== formValues.confirmPassword) validationErrors.confirmPassword = 'Passwords do not match'
    return validationErrors
  })

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      })
      updateUser(res.data.user)
      navigate(getHomeRouteForUser({ ...user, ...res.data.user }))
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to change your password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Change Password</h1>
        <p className="text-sm text-gray-500 mb-6">You must change your default password before continuing.</p>
        <Alert type="error" message={error} />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            name="currentPassword"
            type="password"
            value={values.currentPassword}
            onChange={handleChange}
            placeholder="Current password"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.currentPassword ? <p className="text-xs text-red-600">{errors.currentPassword}</p> : null}
          <input
            name="newPassword"
            type="password"
            value={values.newPassword}
            onChange={handleChange}
            placeholder="New password"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.newPassword ? <p className="text-xs text-red-600">{errors.newPassword}</p> : null}
          <input
            name="confirmPassword"
            type="password"
            value={values.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm new password"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.confirmPassword ? <p className="text-xs text-red-600">{errors.confirmPassword}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChangePassword
