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
    else if (formValues.newPassword.length < 8) validationErrors.newPassword = 'Password must be at least 8 characters'
    else if (!/[A-Z]/.test(formValues.newPassword)) validationErrors.newPassword = 'Password must contain an uppercase letter'
    else if (!/[a-z]/.test(formValues.newPassword)) validationErrors.newPassword = 'Password must contain a lowercase letter'
    else if (!/[0-9]/.test(formValues.newPassword)) validationErrors.newPassword = 'Password must contain a number'
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
      const nextUser = {
        ...user,
        ...res.data.user,
        profileCompleted: res.data.user?.profileCompleted ?? user?.profileCompleted
      }
      updateUser(res.data.user)
      navigate(getHomeRouteForUser(nextUser))
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to change your password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[--color-bg] dark:bg-slate-800 flex items-center justify-center p-4">
      <div className="bg-[--color-bg-card] dark:bg-slate-800 p-8 rounded-2xl shadow-md dark:shadow-slate-900/50 w-full max-w-md">
        <h1 className="text-2xl font-bold text-[--color-text] dark:text-slate-100 mb-2">Change Password</h1>
        <p className="text-sm text-[--color-text-muted] dark:text-slate-400 mb-6">You must change your default password before continuing.</p>
        <Alert type="error" message={error} />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="ui-form-label">Current Password</label>
            <input
              name="currentPassword"
              type="password"
              value={values.currentPassword}
              onChange={handleChange}
              placeholder="Enter current password"
              className={`ui-form-input ${errors.currentPassword ? 'ui-form-input-error' : ''}`}
            />
            {errors.currentPassword ? <p className="ui-form-helper-error">{errors.currentPassword}</p> : null}
          </div>
          <div>
            <label className="ui-form-label">New Password</label>
            <input
              name="newPassword"
              type="password"
              value={values.newPassword}
              onChange={handleChange}
              placeholder="Enter new password"
              className={`ui-form-input ${errors.newPassword ? 'ui-form-input-error' : ''}`}
            />
            {errors.newPassword ? <p className="ui-form-helper-error">{errors.newPassword}</p> : null}
          </div>
          <div>
            <label className="ui-form-label">Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              value={values.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm new password"
              className={`ui-form-input ${errors.confirmPassword ? 'ui-form-input-error' : ''}`}
            />
            {errors.confirmPassword ? <p className="ui-form-helper-error">{errors.confirmPassword}</p> : null}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2 font-medium text-white hover:bg-primary disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ChangePassword
