import { useEffect, useMemo, useState } from 'react'
import { Camera, UserRound } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import InstructorLayout from '../../layouts/InstructorLayout'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import api, { resolveFileUrl } from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ProfilePage = () => {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null)
  const [form, setForm] = useState({
    phone: '',
    address: '',
    fatherName: '',
    motherName: '',
    fatherPhone: '',
    motherPhone: '',
    bloodGroup: '',
    localGuardianName: '',
    localGuardianAddress: '',
    localGuardianPhone: '',
    permanentAddress: '',
    temporaryAddress: '',
    dateOfBirth: '',
    section: ''
  })

  const avatarPreviewUrl = useMemo(() => {
    if (selectedAvatarFile) {
      return URL.createObjectURL(selectedAvatarFile)
    }

    return resolveFileUrl(profile?.avatar || user?.avatar)
  }, [profile?.avatar, selectedAvatarFile, user?.avatar])

  useEffect(() => {
    fetchProfile()
  }, [])

  useEffect(() => {
    return () => {
      if (selectedAvatarFile) {
        window.URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl, selectedAvatarFile])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await api.get('/auth/me')
      const currentUser = res.data.user
      setProfile(currentUser)
      setForm({
        phone: currentUser.phone || '',
        address: currentUser.address || '',
        fatherName: currentUser.student?.fatherName || '',
        motherName: currentUser.student?.motherName || '',
        fatherPhone: currentUser.student?.fatherPhone || '',
        motherPhone: currentUser.student?.motherPhone || '',
        bloodGroup: currentUser.student?.bloodGroup || '',
        localGuardianName: currentUser.student?.localGuardianName || '',
        localGuardianAddress: currentUser.student?.localGuardianAddress || '',
        localGuardianPhone: currentUser.student?.localGuardianPhone || '',
        permanentAddress: currentUser.student?.permanentAddress || '',
        temporaryAddress: currentUser.student?.temporaryAddress || currentUser.address || '',
        dateOfBirth: currentUser.student?.dateOfBirth ? new Date(currentUser.student.dateOfBirth).toISOString().slice(0, 10) : '',
        section: currentUser.student?.section || ''
      })
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to load the profile right now.'))
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError('')
      const endpoint = profile?.role === 'STUDENT' && !profile?.profileCompleted ? '/auth/complete-profile' : '/auth/profile'
      const res = await api.patch(endpoint, form)
      setProfile(res.data.user)
      updateUser(res.data.user)
      setSuccess(profile?.role === 'STUDENT' && !profile?.profileCompleted ? 'Profile completed successfully!' : 'Profile updated successfully!')
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to save your profile right now.'))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null
    if (!nextFile) {
      setSelectedAvatarFile(null)
      return
    }

    if (!nextFile.type.startsWith('image/')) {
      setError('Please choose a valid image file for your profile photo.')
      event.target.value = ''
      return
    }

    setError('')
    setSelectedAvatarFile(nextFile)
  }

  const uploadAvatar = async () => {
    if (!selectedAvatarFile) {
      setError('Please choose an image before uploading.')
      return
    }

    try {
      setUploadingAvatar(true)
      setError('')
      const payload = new FormData()
      payload.append('avatar', selectedAvatarFile)

      const res = await api.post('/auth/avatar', payload, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setProfile(res.data.user)
      updateUser(res.data.authUser || res.data.user)
      setSelectedAvatarFile(null)
      showToast({ title: 'Profile photo updated.' })
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to upload your profile photo right now.'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const renderLayout = (content) => {
    if (user?.role === 'STUDENT') return <StudentLayout>{content}</StudentLayout>
    if (user?.role === 'COORDINATOR') return <CoordinatorLayout>{content}</CoordinatorLayout>
    if (user?.role === 'INSTRUCTOR') return <InstructorLayout>{content}</InstructorLayout>
    return <AdminLayout>{content}</AdminLayout>
  }

  if (loading) {
    return renderLayout(<LoadingSpinner text="Loading profile..." />)
  }

  return renderLayout(
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader
        title="My Profile"
        subtitle="Keep your contact details current while identity fields remain locked for authenticity."
        breadcrumbs={[user?.role === 'STUDENT' ? 'Student' : user?.role === 'INSTRUCTOR' ? 'Instructor' : 'Admin', 'Profile']}
      />

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <form onSubmit={saveProfile} className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-slate-200 text-slate-500">
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt={`${profile?.name || 'User'} avatar`} className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-10 w-10" />
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">Profile photo</p>
              <p className="mt-1 text-sm text-slate-500">Upload a clear square image for your account profile.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Camera className="h-4 w-4" />
              <span>{selectedAvatarFile ? 'Change photo' : 'Choose photo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarFileChange} />
            </label>
            <button
              type="button"
              onClick={uploadAvatar}
              disabled={!selectedAvatarFile || uploadingAvatar}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingAvatar ? 'Uploading...' : 'Upload photo'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Full Name</label>
            <input value={profile?.name || ''} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-gray-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Email Address</label>
            <input value={profile?.email || ''} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-gray-500" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Student ID</label>
              <input value={profile.student?.rollNumber || ''} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-gray-500" />
            </div>
          ) : null}
          {(profile?.role === 'INSTRUCTOR' || profile?.role === 'COORDINATOR') ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Department</label>
              <input value={profile?.instructor?.department || profile?.coordinator?.department || ''} disabled className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-gray-500" />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Phone Number</label>
            <input value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Section</label>
              <input value={form.section} onChange={(e) => setForm((current) => ({ ...current, section: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
            </div>
          ) : null}
          {profile?.role === 'STUDENT' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Father Name</label>
                <input value={form.fatherName} onChange={(e) => setForm((current) => ({ ...current, fatherName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Father Contact Number</label>
                <input value={form.fatherPhone} onChange={(e) => setForm((current) => ({ ...current, fatherPhone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Mother Name</label>
                <input value={form.motherName} onChange={(e) => setForm((current) => ({ ...current, motherName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Mother Contact Number</label>
                <input value={form.motherPhone} onChange={(e) => setForm((current) => ({ ...current, motherPhone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={(e) => setForm((current) => ({ ...current, dateOfBirth: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Blood Group</label>
                <input value={form.bloodGroup} onChange={(e) => setForm((current) => ({ ...current, bloodGroup: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Local Guardian Name</label>
                <input value={form.localGuardianName} onChange={(e) => setForm((current) => ({ ...current, localGuardianName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Local Guardian Contact Number</label>
                <input value={form.localGuardianPhone} onChange={(e) => setForm((current) => ({ ...current, localGuardianPhone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
            </>
          ) : null}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-600">{profile?.role === 'STUDENT' ? 'Temporary Address' : 'Address'}</label>
            <textarea rows={4} value={profile?.role === 'STUDENT' ? form.temporaryAddress : form.address} onChange={(e) => setForm((current) => ({ ...current, [profile?.role === 'STUDENT' ? 'temporaryAddress' : 'address']: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-600">Permanent Address</label>
                <textarea rows={4} value={form.permanentAddress} onChange={(e) => setForm((current) => ({ ...current, permanentAddress: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-600">Local Guardian Address</label>
                <textarea rows={4} value={form.localGuardianAddress} onChange={(e) => setForm((current) => ({ ...current, localGuardianAddress: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-4 py-2" />
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-6">
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : profile?.role === 'STUDENT' && !profile?.profileCompleted ? 'Complete Profile' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ProfilePage
