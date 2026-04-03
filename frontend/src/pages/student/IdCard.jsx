import { useEffect, useState } from 'react'
import { CreditCard, MapPin, Phone, QrCode } from 'lucide-react'
import StudentLayout from '../../layouts/StudentLayout'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import api, { resolveFileUrl } from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'

const StudentIdCard = () => {
  const [profile, setProfile] = useState(null)
  const [studentQrCode, setStudentQrCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const avatarUrl = resolveFileUrl(profile?.avatar)

  useEffect(() => {
    const fetchCardData = async () => {
      try {
        setLoading(true)
        const [profileRes, qrRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/auth/student-id-qr')
        ])
        setProfile(profileRes.data.user)
        setStudentQrCode(qrRes.data.qrCode || '')
      } catch (requestError) {
        setError(getFriendlyErrorMessage(requestError, 'Unable to load the student ID card right now.'))
      } finally {
        setLoading(false)
      }
    }

    void fetchCardData()
  }, [])

  return (
    <StudentLayout>
      <div className="mx-auto max-w-5xl p-8">
        <PageHeader
          title="Student ID Card"
          subtitle="Keep your student identity card ready for campus verification and QR-based scans."
          breadcrumbs={['Student', 'ID Card']}
        />

        <Alert type="error" message={error} />

        {loading ? (
          <LoadingSpinner text="Loading student ID card..." />
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#172554_58%,#4338ca_100%)] px-6 py-6 text-white md:px-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_26%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 backdrop-blur">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`${profile?.name || 'Student'} avatar`}
                        className="h-10 w-10 rounded-2xl border border-white/20 object-cover bg-white"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-900">
                        {String(profile?.name || 'S').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">EduNexus</p>
                      <p className="text-sm font-medium text-white/90">Student Identity Card</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Card Holder</p>
                    <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{profile?.name}</h2>
                    <p className="mt-2 text-sm text-white/75">{profile?.student?.rollNumber}</p>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Department</p>
                      <p className="mt-2 text-sm font-semibold text-white">{profile?.student?.department || 'Not assigned'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Semester / Section</p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        Semester {profile?.student?.semester || '--'}{profile?.student?.section ? ` • Section ${profile.student.section}` : ''}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                      <div className="flex items-start gap-3">
                        <Phone className="mt-0.5 h-4 w-4 text-white/70" />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Contact Number</p>
                          <p className="mt-2 text-sm font-semibold text-white">{profile?.phone || 'Not updated yet'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 text-white/70" />
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Location</p>
                          <p className="mt-2 text-sm font-semibold text-white">
                            {profile?.student?.temporaryAddress || profile?.address || 'Address not updated yet'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative flex w-full shrink-0 flex-col justify-between rounded-[26px] bg-white p-5 text-slate-900 shadow-2xl lg:w-[260px]">
                  <div className="mb-5 flex items-center gap-3 rounded-3xl bg-slate-50 p-3">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={`${profile?.name || 'Student'} profile`}
                        className="h-16 w-16 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-lg font-black text-slate-700">
                        {String(profile?.name || 'S').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{profile?.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{profile?.student?.rollNumber || 'Student ID pending'}</p>
                    </div>
                  </div>

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
                    <p className="mt-2 text-sm font-semibold text-slate-900">{profile?.email}</p>
                    <p className="mt-1 text-xs text-slate-500">Keep this card visible when needed for campus verification.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentIdCard
