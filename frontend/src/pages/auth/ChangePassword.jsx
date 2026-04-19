import { useState } from 'react'
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Alert from '../../components/Alert'
import AuthSplitLayout from '../../components/AuthSplitLayout'
import FormInput from '../../components/common/FormInput'
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
  const features = [
    {
      icon: ShieldCheck,
      title: 'Mandatory security step',
      description: 'Complete this once to replace your temporary password before entering your dashboard.'
    },
    {
      icon: KeyRound,
      title: 'Policy-compliant password',
      description: 'Use uppercase, lowercase, numbers, and at least 8 characters for account safety.'
    },
    {
      icon: LockKeyhole,
      title: 'Immediate activation',
      description: 'After a successful update, your account continues with the new credential only.'
    }
  ]
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
    <AuthSplitLayout
      title="Replace your default password before entering TriLearn."
      subtitle="This one-time step protects your account and unlocks your role-based workspace."
      formTitle="Change password"
      formSubtitle="Update your credentials to continue."
      features={features}
      hideAside
      contentWidthClassName="max-w-lg"
    >
      <Alert type="error" message={error} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <FormInput
          label="Current Password"
          name="currentPassword"
          type="password"
          value={values.currentPassword}
          onChange={handleChange}
          placeholder="Enter current password"
          error={errors.currentPassword}
        />
        <FormInput
          label="New Password"
          name="newPassword"
          type="password"
          value={values.newPassword}
          onChange={handleChange}
          placeholder="Enter new password"
          error={errors.newPassword}
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
          <span>{loading ? 'Saving...' : 'Change Password'}</span>
        </button>
      </form>
    </AuthSplitLayout>
  )
}

export default ChangePassword
