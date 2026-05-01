import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  CalendarDays,
  Clock3,
  QrCode,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Users
} from 'lucide-react'
import GateLayout from '../../layouts/GateLayout'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import QrScanPanel from '../../components/QrScanPanel'
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
  const reduceMotion = useReducedMotion()

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

  const statusLabel = useMemo(() => {
    if (liveQrState?.holiday) return 'Holiday'
    if (liveQrState?.active) return 'Live'
    if (liveQrState?.timePassed) return 'Closed'
    return 'Standby'
  }, [liveQrState])

  const statusDetails = useMemo(() => {
    if (liveQrState?.holiday) {
      return liveQrState.holidayInfo?.title || 'Holiday mode is active'
    }
    if (liveQrState?.active) {
      return `Semesters ${liveQrState.allowedSemesters?.join(', ')} can scan until ${formatTime(liveQrState.expiresAt)}`
    }
    if (liveQrState?.timePassed) {
      return 'The final scan window for today has closed'
    }
    if (liveQrState?.nextWindow) {
      return `Next window opens at ${formatTime(liveQrState.nextWindow.startsAt)}`
    }
    return 'No scan slot configured for the remainder of today'
  }, [liveQrState])

  const kpis = useMemo(() => ([
    {
      label: 'Mode',
      value: statusLabel,
      detail: statusDetails,
      icon: Activity
    },
    {
      label: 'Allowed Semesters',
      value: liveQrState?.active ? String(liveQrState.allowedSemesters?.length || 0) : '0',
      detail: liveQrState?.active ? `S${liveQrState.allowedSemesters?.join(', S')}` : 'No active slot',
      icon: Users
    },
    {
      label: 'Refresh Timer',
      value: liveQrState?.active ? `${liveQrState.refreshInSeconds || 0}s` : '--',
      detail: liveQrState?.active ? `Expires ${formatTime(liveQrState.expiresAt)}` : 'Waiting for live QR',
      icon: TimerReset
    },
    {
      label: 'Server Time',
      value: formatTime(liveQrState?.serverTime),
      detail: liveQrState?.dayOfWeek || '--',
      icon: Clock3
    }
  ]), [liveQrState, statusDetails, statusLabel])

  const operationalChecklist = [
    'Keep the rotating QR visible only during active windows.',
    'Use student ID card scanning when students cannot use mobile scan.',
    'Confirm the scanner reads the student ID card QR before marking attendance.',
    'Refresh immediately if timer appears stale or window just changed.'
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

  const containerMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: 'easeOut' }
      }

  return (
    <GateLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Gate Operations"
          subtitle="Live student attendance QR operations with controlled scan windows and on-desk verification support."
          breadcrumbs={['Gatekeeper', 'Operations']}
          actions={[
            {
              label: refreshing ? 'Refreshing...' : 'Refresh State',
              icon: RefreshCw,
              variant: 'secondary',
              onClick: () => fetchLiveQr({ silent: true }),
              disabled: refreshing
            }
          ]}
        />

        {error ? (
          <div className="mb-6 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
            {error}
          </div>
        ) : null}

        {loading && !liveQrState ? (
          <LoadingSkeleton rows={4} itemClassName="h-40" />
        ) : (
          <motion.div className="space-y-6" {...containerMotion}>
            <section className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-4 shadow-sm dark:shadow-slate-900/50 md:px-6 md:py-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => {
                  const Icon = kpi.icon
                  return (
                    <div
                      key={kpi.label}
                      className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">{kpi.label}</p>
                        <Icon className="h-4 w-4 text-[var(--color-role-accent)]" />
                      </div>
                      <p className="mt-2 text-xl font-black text-[var(--color-heading)]">{kpi.value}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{kpi.detail}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-[1.75rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-6 shadow-sm dark:shadow-slate-900/50">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-card-border)] pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-soft)]">Live Student QR</p>
                    <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">
                      {statusLabel === 'Live' ? 'Scanning Window Active' : statusLabel === 'Holiday' ? 'Holiday Mode' : 'Waiting for Next Window'}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{statusDetails}</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    statusLabel === 'Live'
                      ? 'bg-emerald-100 text-emerald-700'
                      : statusLabel === 'Holiday'
                        ? 'bg-sky-100 text-sky-700'
                        : statusLabel === 'Closed'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                  }`}>
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {statusLabel}
                  </span>
                </div>

                {liveQrState?.active ? (
                  <div className="mx-auto mt-6 max-w-sm rounded-[1.4rem] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-4">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-soft)]">
                        <span>Rotating QR</span>
                        <QrCode className="h-4 w-4" />
                      </div>
                      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-3">
                        <img src={liveQrState.qrCode} alt="Student attendance QR" className="w-full rounded-xl" />
                      </div>
                      <div className="mt-4">
                        <p className="text-center text-xs text-[var(--color-text-muted)]">Expires at {formatTime(liveQrState.expiresAt)}</p>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-card-border)]">
                          <motion.div
                            className="h-full bg-[var(--color-role-accent)]"
                            initial={false}
                            animate={{ width: `${Math.max(2, Math.min(100, (liveQrState.refreshInSeconds || 0) * (100 / 60)))}%` }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-surface-muted)] px-5 py-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-card-surface)] text-[var(--color-role-accent)]">
                      <CalendarDays className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[var(--color-heading)]">
                      {statusLabel === 'Holiday' ? 'Attendance paused for holiday' : 'No live scan slot right now'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
                      {liveQrState?.holiday
                        ? liveQrState.holidayInfo?.description || 'Attendance deduction is skipped today.'
                        : liveQrState?.nextWindow
                          ? `Next slot: ${liveQrState.nextWindow.startTime} to ${liveQrState.nextWindow.endTime}.`
                          : 'Ask an admin or coordinator to configure a gate scan window if required.'}
                    </p>
                  </div>
                )}
              </section>

              <aside className="space-y-6">
                <QrScanPanel
                  title="Scan Student ID Card"
                  description="Use the gate desk scanner to mark attendance for eligible students during the active scan window."
                  submitLabel="Mark Attendance"
                  onSubmit={submitStudentIdQr}
                  busy={scanBusy}
                  accentClassName="focus:ring-amber-500"
                />

                <section className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5 shadow-sm dark:shadow-slate-900/50">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Operational Checklist</h2>
                  <div className="mt-4 space-y-2.5">
                    {operationalChecklist.map((item, index) => (
                      <motion.p
                        key={item}
                        className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-3 text-sm text-[var(--color-text-muted)]"
                        initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                        animate={reduceMotion ? {} : { opacity: 1, x: 0 }}
                        transition={reduceMotion ? {} : { duration: 0.2, delay: 0.06 * index }}
                      >
                        {item}
                      </motion.p>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--color-card-border)] bg-[var(--color-card-surface)] p-5 shadow-sm dark:shadow-slate-900/50">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Slot Awareness</h2>
                  <div className="mt-4 space-y-2.5 text-sm text-[var(--color-text-muted)]">
                    <p className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-3">
                      Server time: <span className="font-semibold text-[var(--color-heading)]">{formatTime(liveQrState?.serverTime)}</span>
                    </p>
                    <p className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-3">
                      Next slot: <span className="font-semibold text-[var(--color-heading)]">{liveQrState?.nextWindow ? `${liveQrState.nextWindow.startTime} - ${liveQrState.nextWindow.endTime}` : 'No further slot today'}</span>
                    </p>
                    <p className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-3">
                      Active semesters: <span className="font-semibold text-[var(--color-heading)]">{liveQrState?.active ? liveQrState.allowedSemesters?.join(', ') : 'None right now'}</span>
                    </p>
                  </div>
                </section>
              </aside>
            </div>
          </motion.div>
        )}
      </div>
    </GateLayout>
  )
}

export default GateDashboard
