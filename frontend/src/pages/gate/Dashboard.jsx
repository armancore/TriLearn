import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import GateLayout from '../../layouts/GateLayout'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import logger from '../../utils/logger'
import PageHeader from '../../components/PageHeader'
import LoadingSkeleton from '../../components/LoadingSkeleton'

const formatTime = (value) => (
  value
    ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--'
)

const formatDepartment = (department) => {
  if (!department) return 'Department'
  return String(department)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const GateDashboard = () => {
  const [liveQrState, setLiveQrState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchLiveQr = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')
      const res = await api.get('/attendance/gatekeeper/live-qr')
      setLiveQrState(res.data)
    } catch (requestError) {
      logger.error(requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to load the live gate QR right now.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchLiveQr()

    const intervalId = window.setInterval(() => {
      void fetchLiveQr({ silent: true })
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [fetchLiveQr])

  const activePeriods = liveQrState?.periods || []
  const nextWindow = liveQrState?.nextWindow || null

  const summaryLabel = useMemo(() => {
    if (liveQrState?.active) {
      return `${activePeriods.length} active period${activePeriods.length === 1 ? '' : 's'}`
    }

    if (nextWindow) {
      return `Next window at ${formatTime(nextWindow.startsAt)}`
    }

    return 'No routine window today'
  }, [activePeriods.length, liveQrState?.active, nextWindow])

  return (
    <GateLayout>
      <div className="p-4 md:p-8">
        <PageHeader
          title="Live Gate QR"
          subtitle="The gate QR rotates every 60 seconds and only works during the active routine window, from class start until 15 minutes later."
          breadcrumbs={['Gatekeeper', 'Live QR']}
          actions={[
            {
              label: refreshing ? 'Refreshing...' : 'Refresh Now',
              icon: RefreshCw,
              variant: 'secondary',
              onClick: () => fetchLiveQr({ silent: true }),
              disabled: refreshing
            }
          ]}
        />

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {loading && !liveQrState ? (
          <LoadingSkeleton rows={3} itemClassName="h-48" />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <section className="ui-card rounded-3xl p-6 md:p-8">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    <ShieldCheck className="h-4 w-4" />
                    <span>{summaryLabel}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-bold text-slate-900">
                    {liveQrState?.active ? 'Attendance window is live' : 'Waiting for the next class window'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {liveQrState?.active
                      ? `Students in the listed semesters can scan this QR until ${formatTime(liveQrState?.expiresAt)}.`
                      : nextWindow
                        ? `The next gate scan opens at ${formatTime(nextWindow.startsAt)} for the scheduled period below.`
                        : 'There are no more routine periods available for gate attendance today.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Day</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{liveQrState?.dayOfWeek || '--'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Refresh</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {liveQrState?.active ? `${liveQrState?.refreshInSeconds || 0}s` : 'Live check'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 col-span-2 sm:col-span-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Server Time</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{formatTime(liveQrState?.serverTime)}</p>
                  </div>
                </div>
              </div>

              {liveQrState?.active ? (
                <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                  <div className="space-y-4">
                    {activePeriods.map((period) => (
                      <div key={period.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-slate-900">{period.subject?.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {period.subject?.code} • Semester {period.subject?.semester} • {formatDepartment(period.subject?.department)}
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-role-gate)] shadow-sm">
                            <CalendarClock className="h-4 w-4" />
                            <span>{formatTime(period.startsAt)} - {formatTime(period.scanClosesAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <span>Rotating QR</span>
                      <QrCode className="h-4 w-4" />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <img src={liveQrState.qrCode} alt="Live gate attendance QR" className="w-full rounded-2xl" />
                    </div>
                    <p className="mt-4 text-center text-sm text-slate-500">
                      This QR refreshes automatically and expires at <span className="font-semibold text-slate-800">{formatTime(liveQrState.expiresAt)}</span>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[var(--color-role-gate)] shadow-sm">
                    <CalendarClock className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">No live scan window right now</h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                    The gatekeeper QR appears only while a scheduled routine period is active. Once the next class starts, this screen will refresh automatically.
                  </p>
                  {nextWindow ? (
                    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Next Scheduled Period</p>
                      <p className="mt-3 font-semibold text-slate-900">{nextWindow.subject?.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {nextWindow.subject?.code} • Semester {nextWindow.subject?.semester} • {formatDepartment(nextWindow.subject?.department)}
                      </p>
                      <p className="mt-3 text-sm text-slate-600">
                        Opens at {formatTime(nextWindow.startsAt)} and accepts scans until {formatTime(nextWindow.scanClosesAt)}.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="ui-card rounded-3xl p-6">
                <h2 className="text-lg font-semibold text-slate-900">How This Works</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">The QR is valid only for the currently active routine period.</p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">Students can scan from class start until 15 minutes after the period begins.</p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">The code rotates every minute, so older screenshots stop working quickly.</p>
                </div>
              </section>

              <section className="ui-card rounded-3xl p-6">
                <h2 className="text-lg font-semibold text-slate-900">Attendance Rule</h2>
                <p className="mt-3 text-sm text-slate-500">
                  If a student does not scan during the live window and the instructor also does not mark them manually, the system records an absence after the window closes and the student can submit a ticket.
                </p>
              </section>
            </aside>
          </div>
        )}
      </div>
    </GateLayout>
  )
}

export default GateDashboard
