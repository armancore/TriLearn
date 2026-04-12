import { useEffect, useMemo, useState } from 'react'
import { Camera, UserRound } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import InstructorLayout from '../../layouts/InstructorLayout'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import ConfirmDialog from '../../components/ConfirmDialog'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import useUnsavedChangesGuard from '../../hooks/useUnsavedChangesGuard'
import api, { resolveFileUrl } from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { isRequestCanceled } from '../../utils/http'

const formatActivityLabel = (action) => ({
  AUTH_LOGIN: 'Signed in',
  AUTH_LOGOUT: 'Signed out',
  AUTH_LOGOUT_ALL_DEVICES: 'Signed out all devices'
}[action] || action.replaceAll('_', ' ').toLowerCase())

const getSessionLabel = (userAgent) => {
  const normalized = String(userAgent || '').toLowerCase()

  if (normalized.includes('edg')) return 'Microsoft Edge'
  if (normalized.includes('chrome')) return 'Google Chrome'
  if (normalized.includes('firefox')) return 'Mozilla Firefox'
  if (normalized.includes('safari') && !normalized.includes('chrome')) return 'Safari'
  if (normalized.includes('android')) return 'Android device'
  if (normalized.includes('iphone') || normalized.includes('ipad')) return 'Apple device'

  return userAgent || 'Unknown device'
}

const toDateInputValue = (value) => {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

const formatDateTime = (value) => {
  if (!value) {
    return 'Unknown'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString()
}

const getRoleLabel = (role) => ({
  STUDENT: 'Student',
  INSTRUCTOR: 'Instructor',
  COORDINATOR: 'Coordinator',
  ADMIN: 'Admin'
}[role] || 'Account')

const buildFormState = (currentUser) => ({
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
  dateOfBirth: toDateInputValue(currentUser.student?.dateOfBirth),
  section: currentUser.student?.section || ''
})

const ProfilePage = () => {
  const { user, updateUser, logout } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [activityItems, setActivityItems] = useState([])
  const [sessions, setSessions] = useState([])
  const [revokingSessions, setRevokingSessions] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null)
  const [form, setForm] = useState(buildFormState({}))
  const [initialForm, setInitialForm] = useState(buildFormState({}))

  const avatarPreviewUrl = useMemo(() => {
    if (selectedAvatarFile) {
      return URL.createObjectURL(selectedAvatarFile)
    }

    return resolveFileUrl(profile?.avatar || user?.avatar)
  }, [profile?.avatar, selectedAvatarFile, user?.avatar])
  const hasUnsavedChanges = useMemo(() => (
    selectedAvatarFile !== null || JSON.stringify(form) !== JSON.stringify(initialForm)
  ), [form, initialForm, selectedAvatarFile])
  const { dialogOpen, leavePage, stayOnPage } = useUnsavedChangesGuard(
    hasUnsavedChanges && !saving && !uploadingAvatar && !loading
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchProfile(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    return () => {
      if (selectedAvatarFile) {
        window.URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl, selectedAvatarFile])

  const fetchProfile = async (signal) => {
    try {
      setLoading(true)
      setActivityLoading(true)
      setActivityError('')

      const [profileRes, activityRes] = await Promise.all([
        api.get('/auth/me', { signal }),
        api.get('/auth/activity', { signal })
      ])
      const currentUser = profileRes.data.user
      const nextForm = buildFormState(currentUser)
      setProfile(currentUser)
      setActivityItems(activityRes.data.activity || [])
      setSessions(activityRes.data.sessions || [])
      setForm(nextForm)
      setInitialForm(nextForm)
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      setError(getFriendlyErrorMessage(requestError, 'Unable to load the profile right now.'))
      setActivityError(getFriendlyErrorMessage(requestError, 'Unable to load recent activity right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setActivityLoading(false)
      }
    }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError('')
      const endpoint = profile?.role === 'STUDENT' && !profile?.profileCompleted ? '/auth/complete-profile' : '/auth/profile'
      const res = await api.patch(endpoint, form)
      const nextUser = res.data.user
      const nextForm = buildFormState(nextUser)
      setProfile(nextUser)
      setForm(nextForm)
      setInitialForm(nextForm)
      updateUser(nextUser)
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
      setInitialForm(buildFormState(res.data.user))
      setSelectedAvatarFile(null)
      showToast({ title: 'Profile photo updated.' })
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, 'Unable to upload your profile photo right now.'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const revokeAllSessions = async () => {
    try {
      setRevokingSessions(true)
      setActivityError('')
      await api.post('/auth/logout-all')
      await logout({ skipRequest: true })
    } catch (requestError) {
      setActivityError(getFriendlyErrorMessage(requestError, 'Unable to sign out all devices right now.'))
    } finally {
      setRevokingSessions(false)
    }
  }

  const renderLayout = (content) => {
    if (user?.role === 'STUDENT') return <StudentLayout>{content}</StudentLayout>
    if (user?.role === 'COORDINATOR') return <CoordinatorLayout>{content}</CoordinatorLayout>
    if (user?.role === 'INSTRUCTOR') return <InstructorLayout>{content}</InstructorLayout>
    return <AdminLayout>{content}</AdminLayout>
  }

  if (loading) {
    return renderLayout(
      <div className="p-4 md:p-8">
        <LoadingSkeleton rows={5} itemClassName="h-24" />
      </div>
    )
  }

  return renderLayout(
    <>
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader
        title="My Profile"
        subtitle="Keep your contact details current while identity fields remain locked for authenticity."
        breadcrumbs={[getRoleLabel(user?.role), 'Profile']}
      />

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <form onSubmit={saveProfile} className="rounded-3xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50 md:p-8">
        <div className="mb-8 flex flex-col gap-5 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]">
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt={`${profile?.name || 'User'} avatar`} className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-10 w-10" />
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--color-text)]">Profile photo</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Upload a clear square image for your account profile.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-card-border)] bg-[--color-bg-card] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]">
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
            <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Full Name</label>
            <input value={profile?.name || ''} disabled className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 bg-[--color-bg] dark:bg-slate-900 px-4 py-2 text-[--color-text-muted] dark:text-slate-400" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Email Address</label>
            <input value={profile?.email || ''} disabled className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 bg-[--color-bg] dark:bg-slate-900 px-4 py-2 text-[--color-text-muted] dark:text-slate-400" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Student ID</label>
              <input value={profile.student?.rollNumber || ''} disabled className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 bg-[--color-bg] dark:bg-slate-900 px-4 py-2 text-[--color-text-muted] dark:text-slate-400" />
            </div>
          ) : null}
          {(profile?.role === 'INSTRUCTOR' || profile?.role === 'COORDINATOR') ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Department</label>
              <input value={profile?.instructor?.department || profile?.coordinator?.department || ''} disabled className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 bg-[--color-bg] dark:bg-slate-900 px-4 py-2 text-[--color-text-muted] dark:text-slate-400" />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Phone Number</label>
            <input value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Section</label>
              <input value={form.section} onChange={(e) => setForm((current) => ({ ...current, section: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
            </div>
          ) : null}
          {profile?.role === 'STUDENT' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Father Name</label>
                <input value={form.fatherName} onChange={(e) => setForm((current) => ({ ...current, fatherName: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Father Contact Number</label>
                <input value={form.fatherPhone} onChange={(e) => setForm((current) => ({ ...current, fatherPhone: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Mother Name</label>
                <input value={form.motherName} onChange={(e) => setForm((current) => ({ ...current, motherName: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Mother Contact Number</label>
                <input value={form.motherPhone} onChange={(e) => setForm((current) => ({ ...current, motherPhone: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={(e) => setForm((current) => ({ ...current, dateOfBirth: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Blood Group</label>
                <input value={form.bloodGroup} onChange={(e) => setForm((current) => ({ ...current, bloodGroup: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Local Guardian Name</label>
                <input value={form.localGuardianName} onChange={(e) => setForm((current) => ({ ...current, localGuardianName: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Local Guardian Contact Number</label>
                <input value={form.localGuardianPhone} onChange={(e) => setForm((current) => ({ ...current, localGuardianPhone: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
            </>
          ) : null}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">{profile?.role === 'STUDENT' ? 'Temporary Address' : 'Address'}</label>
            <textarea rows={4} value={profile?.role === 'STUDENT' ? form.temporaryAddress : form.address} onChange={(e) => setForm((current) => ({ ...current, [profile?.role === 'STUDENT' ? 'temporaryAddress' : 'address']: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
          </div>
          {profile?.role === 'STUDENT' ? (
            <>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Permanent Address</label>
                <textarea rows={4} value={form.permanentAddress} onChange={(e) => setForm((current) => ({ ...current, permanentAddress: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[--color-text-muted] dark:text-slate-400">Local Guardian Address</label>
                <textarea rows={4} value={form.localGuardianAddress} onChange={(e) => setForm((current) => ({ ...current, localGuardianAddress: e.target.value }))} className="w-full rounded-lg border border-[--color-border] dark:border-slate-700 px-4 py-2" />
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-6">
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 font-medium text-white hover:bg-primary disabled:opacity-50">
            {saving ? 'Saving...' : profile?.role === 'STUDENT' && !profile?.profileCompleted ? 'Complete Profile' : 'Save Profile'}
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-3xl bg-[--color-bg-card] p-6 shadow-sm dark:shadow-slate-900/50 md:p-8">
        <div className="flex flex-col gap-3 border-b border-[var(--color-card-border)] pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Recent activity</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Track sign-ins and review active sessions tied to your account.</p>
          </div>
          <button
            type="button"
            onClick={revokeAllSessions}
            disabled={revokingSessions || sessions.length === 0}
            className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-semibold text-accent-700 transition hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revokingSessions ? 'Signing out...' : 'Sign out all devices'}
          </button>
        </div>

        <Alert type="error" message={activityError} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Timeline</h3>
            {activityLoading ? (
              <div className="mt-4 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">Loading account activity...</div>
            ) : activityItems.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">No recent account activity recorded yet.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {activityItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{formatActivityLabel(item.action)}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      {item.metadata?.ipAddress ? (
                        <span className="rounded-full bg-[--color-bg-card] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">{item.metadata.ipAddress}</span>
                      ) : null}
                    </div>
                    {item.metadata?.userAgent ? (
                      <p className="mt-3 text-sm text-[var(--color-text-muted)]">{getSessionLabel(item.metadata.userAgent)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Active sessions</h3>
            {activityLoading ? (
              <div className="mt-4 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">Loading active sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">No active sessions found.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-4 shadow-sm dark:shadow-slate-900/50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{getSessionLabel(session.userAgent)}</p>
                      {session.current ? (
                        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary">Current</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">IP: {session.ipAddress || 'Unknown'}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Started: {formatDateTime(session.createdAt)}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Last used: {session.lastUsedAt ? formatDateTime(session.lastUsedAt) : 'Not tracked yet'}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Expires: {formatDateTime(session.expiresAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
    <ConfirmDialog
      open={dialogOpen}
      title="Leave this page?"
      message="You have unsaved profile changes. Leaving now will discard them."
      confirmText="Leave Page"
      cancelText="Stay Here"
      tone="info"
      onConfirm={leavePage}
      onClose={stayOnPage}
    />
    </>
  )
}

export default ProfilePage
