import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, QrCode, RefreshCw, ShieldCheck, TimerReset, Users } from 'lucide-react'
import GateLayout from '../../layouts/GateLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import QrScanPanel from '../../components/QrScanPanel'
import StatCard from '../../components/StatCard'
import api from '../../utils/api'
import { isRequestCanceled } from '../../utils/http'
import logger from '../../utils/logger'
import { getFriendlyErrorMessage } from '../../utils/errors'
import { useToast } from '../../components/Toast'

const formatTime = (value) => (
  value
    ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--'
)

const GateDashboard = () => {
  const [liveQrState, setLiveQrState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const { showToast } = useToast()

  const fetchLiveQr = useCallback(async ({ silent = false, signal } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')
      const res = await api.get('/attendance/gatekeeper/live-qr', { signal })
      setLiveQrState(res.data)
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      logger.error(requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to load the Student QR right now.'))
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeoutIds = new Set()
    void fetchLiveQr({ signal: controller.signal })

    const intervalId = window.setInterval(() => {
      const intervalController = new AbortController()
      void fetchLiveQr({ silent: true, signal: intervalController.signal })
      const timeoutId = window.setTimeout(() => {
        intervalController.abort()
        timeoutIds.delete(timeoutId)
      }, 14000)
      timeoutIds.add(timeoutId)
    }, 15000)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
      timeoutIds.clear()
    }
  }, [fetchLiveQr])

  const statusText = useMemo(() => {
    if (liveQrState?.holiday) {
      return liveQrState.holidayInfo?.title || 'Holiday'
    }

    if (liveQrState?.active) {
      return `Semester ${liveQrState.allowedSemesters?.join(', ')}`
    }

    if (liveQrState?.timePassed) {
      return 'Time passed'
    }

    if (liveQrState?.nextWindow) {
      return `Next at ${formatTime(liveQrState.nextWindow.startsAt)}`
    }

    return 'No slot today'
  }, [liveQrState])

  const gateStats = useMemo(() => ([
    {
      title: 'Allowed Semesters',
      value: liveQrState?.active ? liveQrState.allowedSemesters?.length || 0 : 0,
      icon: Users,
      iconClassName: 'from-amber-500 to-orange-600',
      trend: liveQrState?.active ? `Semester ${liveQrState.allowedSemesters?.join(', ')}` : 'Inactive',
      trendLabel: 'current access'
    },
    {
      title: 'Live Windows',
      value: liveQrState?.active ? liveQrState.periods?.length || 0 : 0,
      icon: QrCode,
      iconClassName: 'from-blue-500 to-cyan-600',
      trend: liveQrState?.dayOfWeek || 'No schedule',
      trendLabel: 'today'
    },
    {
      title: 'Refresh Timer',
      value: liveQrState?.active ? `${liveQrState.refreshInSeconds || 0}s` : '--',
      icon: TimerReset,
      iconClassName: 'from-violet-500 to-purple-600',
      trend: liveQrState?.active ? `Until ${formatTime(liveQrState.expiresAt)}` : 'Waiting',
      trendLabel: 'rotation'
    },
    {
      title: 'Mode',
      value: liveQrState?.holiday ? 'Holiday' : liveQrState?.active ? 'Live' : liveQrState?.timePassed ? 'Closed' : 'Standby',
      icon: ShieldCheck,
      iconClassName: 'from-emerald-500 to-green-600',
      trend: statusText,
      trendLabel: 'gate status'
    }
  ]), [liveQrState, statusText])

  const operationalChecklist = [
    'Keep the rotating QR visible to students in the active slot only.',
    'Scan student ID cards when students cannot use their own phones.',
    'If the day is a holiday, attendance deduction is skipped automatically.',
    'Refresh the QR if the timer looks stale or the next slot just opened.'
  ]

  const submitStudentIdQr = async (qrData) => {
    try {
      setScanBusy(true)
      setError('')
      const res = await api.post('/attendance/scan-student-id', { qrData })
      const subjectList = (res.data.markedSubjects || []).map((subject) => subject.code).join(', ')
      showToast({
        title: `Attendance marked for ${res.data.student?.name || 'student'}.`,
        description: subjectList ? `Recorded for ${subjectList}` : res.data.message
      })
      await fetchLiveQr({ silent: true })
    } catch (requestError) {
      logger.error(requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to mark attendance from the student ID card right now.'))
    } finally {
      setScanBusy(false)
    }
  }

  return (
    <GateLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Student QR"
          subtitle="Show this QR to students. It rotates every minute and only works for the semesters allowed in the current time slot."
          breadcrumbs={['Gatekeeper', 'Student QR']}
          actions={[
            {
              label: refreshing ? 'Refreshing...' : 'Refresh',
              icon: RefreshCw,
              variant: 'secondary',
              onClick: () => fetchLiveQr({ silent: true }),
              disabled: refreshing
            }
          ]}
        />

        {error ? (
          <div className="mb-6 rounded-2xl border border-accent-100 bg-accent-50 px-4 py-3 text-sm text-accent-600">
            {error}
          </div>
        ) : null}

        {loading && !liveQrState ? (
          <LoadingSkeleton rows={3} itemClassName="h-48" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {gateStats.map((stat) => (
                <StatCard
                  key={stat.title}
                  title={stat.title}
                  value={stat.value}
                  icon={stat.icon}
                  iconClassName={stat.iconClassName}
                  trend={stat.trend}
                  trendLabel={stat.trendLabel}
                />
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="ui-card rounded-3xl p-6 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-700">
                    <Clock3 className="h-4 w-4" />
                    <span>{statusText}</span>
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-slate-900">
                    {liveQrState?.holiday
                      ? 'Holiday mode is active'
                      : liveQrState?.active
                        ? 'Student QR is live now'
                        : liveQrState?.timePassed
                          ? 'Scan time has passed'
                          : 'Waiting for the next Student QR slot'}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500">
                    {liveQrState?.holiday
                      ? 'Attendance deduction is skipped today because the college is marked as a holiday.'
                      : liveQrState?.active
                        ? `Only the selected semesters may scan this code until ${formatTime(liveQrState.expiresAt)}.`
                        : liveQrState?.timePassed
                          ? 'The last Student QR window for today has already closed.'
                          : liveQrState?.nextWindow
                            ? `The next Student QR window opens at ${formatTime(liveQrState.nextWindow.startsAt)}.`
                            : 'No Student QR slot is configured for the rest of today.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Day</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{liveQrState?.dayOfWeek || '--'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Refresh</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {liveQrState?.active ? `${liveQrState.refreshInSeconds || 0}s` : '--'}
                    </p>
                  </div>
                </div>
              </div>

              {liveQrState?.active ? (
                <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
                  <div className="space-y-4">
                    {liveQrState.periods?.map((period) => (
                      <div key={period.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="font-semibold text-slate-900">{period.title || 'Student QR Slot'}</p>
                        <p className="mt-1 text-sm text-slate-500">{period.startTime} to {period.endTime}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {period.allowedSemesters?.map((semester) => (
                            <span key={semester} className="ui-status-badge ui-status-warning">Semester {semester}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-[--color-bg-card] dark:bg-slate-800 p-5 shadow-sm dark:shadow-slate-900/50">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <span>Live QR</span>
                      <QrCode className="h-4 w-4" />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <img src={liveQrState.qrCode} alt="Student attendance QR" className="w-full rounded-2xl" />
                    </div>
                    <p className="mt-4 text-center text-sm text-slate-500">
                      Expires at <span className="font-semibold text-slate-800">{formatTime(liveQrState.expiresAt)}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[--color-bg-card] dark:bg-slate-800 text-[var(--color-role-gate)] shadow-sm dark:shadow-slate-900/50">
                    <CalendarDays className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">
                    {liveQrState?.holiday ? 'Today is a holiday' : liveQrState?.timePassed ? 'Time passed' : 'No active Student QR'}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                    {liveQrState?.holiday
                      ? liveQrState.holidayInfo?.description || 'Attendance is paused for today.'
                      : liveQrState?.nextWindow
                        ? `Next slot: ${liveQrState.nextWindow.startTime} to ${liveQrState.nextWindow.endTime} for semester ${liveQrState.nextWindow.allowedSemesters?.join(', ')}.`
                        : 'Ask an admin or coordinator to create a Student QR time slot if one should be available.'}
                  </p>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <QrScanPanel
                title="Scan Student ID Card"
                description="Gatekeeper can scan the student’s ID card QR to mark attendance for the active Student QR time slot."
                submitLabel="Mark Attendance"
                onSubmit={submitStudentIdQr}
                busy={scanBusy}
                accentClassName="focus:ring-amber-500"
              />

              <section className="ui-card rounded-3xl p-6">
                <h2 className="text-lg font-semibold text-slate-900">Gatekeeper Checklist</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  {operationalChecklist.map((item) => (
                    <p key={item} className="rounded-2xl bg-slate-50 px-4 py-3">{item}</p>
                  ))}
                </div>
              </section>

              <section className="ui-card rounded-3xl p-6">
                <h2 className="text-lg font-semibold text-slate-900">Slot Awareness</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    Server time: <span className="font-semibold text-slate-900">{formatTime(liveQrState?.serverTime)}</span>
                  </p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    Next slot: <span className="font-semibold text-slate-900">{liveQrState?.nextWindow ? `${liveQrState.nextWindow.startTime} - ${liveQrState.nextWindow.endTime}` : 'No further slot today'}</span>
                  </p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    Active semesters: <span className="font-semibold text-slate-900">{liveQrState?.active ? liveQrState.allowedSemesters?.join(', ') : 'None right now'}</span>
                  </p>
                </div>
              </section>
            </aside>
          </div>
          </div>
        )}
      </div>
    </GateLayout>
  )
}

export default GateDashboard
