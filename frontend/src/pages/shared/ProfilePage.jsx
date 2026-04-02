import { useEffect, useState } from 'react'
import { CreditCard, MapPin, Phone, QrCode } from 'lucide-react'
import AdminLayout from '../../layouts/AdminLayout'
import CoordinatorLayout from '../../layouts/CoordinatorLayout'
import InstructorLayout from '../../layouts/InstructorLayout'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const ProfilePage = () => {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [studentQrCode, setStudentQrCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
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

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await api.get('/auth/me')
      const currentUser = res.data.user
      setProfile(currentUser)
      if (currentUser.role === 'STUDENT') {
        const qrRes = await api.get('/auth/student-id-qr')
        setStudentQrCode(qrRes.data.qrCode || '')
      } else {
        setStudentQrCode('')
      }
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

      {profile?.role === 'STUDENT' ? (
        <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#172554_58%,#4338ca_100%)] px-6 py-6 text-white md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_26%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-900">
                    {String(profile.name || 'S').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">EduNexus</p>
                    <p className="text-sm font-medium text-white/90">Student Identity Card</p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Card Holder</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{profile.name}</h2>
                  <p className="mt-2 text-sm text-white/75">{profile.student?.rollNumber}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Department</p>
                    <p className="mt-2 text-sm font-semibold text-white">{profile.student?.department || 'Not assigned'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Semester / Section</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      Semester {profile.student?.semester || '--'}{profile.student?.section ? ` • Section ${profile.student.section}` : ''}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                    <div className="flex items-start gap-3">
                      <Phone className="mt-0.5 h-4 w-4 text-white/70" />
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Contact Number</p>
                        <p className="mt-2 text-sm font-semibold text-white">{profile.phone || 'Not updated yet'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-white/70" />
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Location</p>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {profile.student?.temporaryAddress || profile.address || 'Address not updated yet'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative flex w-full shrink-0 flex-col justify-between rounded-[26px] bg-white p-5 text-slate-900 shadow-2xl lg:w-[260px]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Student QR</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Scan for details</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <QrCode className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  {studentQrCode ? (
                    <img src={studentQrCode} alt="Student identity QR" className="w-full rounded-2xl bg-white" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-2xl bg-white text-sm text-slate-400">
                      Loading QR...
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <CreditCard className="h-4 w-4" />
                    <span>Identity Snapshot</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{profile.email}</p>
                  <p className="mt-1 text-xs text-slate-500">Keep this card visible when needed for campus verification.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={saveProfile} className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
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
