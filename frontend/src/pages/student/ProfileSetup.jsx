import { useState } from 'react'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import { getHomeRouteForUser } from '../../utils/auth'
import { getFriendlyErrorMessage } from '../../utils/errors'
import useForm from '../../hooks/useForm'
import { useNavigate } from 'react-router-dom'

const ProfileSetup = () => {
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { values, errors, handleChange, handleSubmit } = useForm({
    name: user?.name || '',
    phone: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
    dateOfBirth: '',
    section: ''
  }, (formValues) => {
    const validationErrors = {}
    ;['name', 'phone', 'address', 'guardianName', 'guardianPhone', 'dateOfBirth', 'section'].forEach((field) => {
      if (!formValues[field]?.trim()) validationErrors[field] = 'This field is required'
    })
    return validationErrors
  })

  const onSubmit = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await api.patch('/auth/complete-profile', values)
      updateUser(res.data.user)
      setSuccess(res.data.message)
      setTimeout(() => navigate(getHomeRouteForUser({ ...user, ...res.data.user })), 1000)
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to submit your profile right now.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <StudentLayout>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Complete Your Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Fill in your basic student details before using the portal.</p>
        </div>
        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ['name', 'Full Name'],
            ['phone', 'Phone Number'],
            ['guardianName', 'Guardian Name'],
            ['guardianPhone', 'Guardian Phone'],
            ['dateOfBirth', 'Date of Birth', 'date'],
            ['section', 'Section']
          ].map(([name, placeholder, type = 'text']) => (
            <div key={name}>
              <input
                name={name}
                type={type}
                value={values[name]}
                onChange={handleChange}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {errors[name] ? <p className="mt-1 text-xs text-red-600">{errors[name]}</p> : null}
            </div>
          ))}
          <div className="md:col-span-2">
            <textarea
              name="address"
              value={values.address}
              onChange={handleChange}
              rows={4}
              placeholder="Address"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {errors.address ? <p className="mt-1 text-xs text-red-600">{errors.address}</p> : null}
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Profile'}
            </button>
          </div>
        </form>
      </div>
    </StudentLayout>
  )
}

export default ProfileSetup
