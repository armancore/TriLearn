import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, Download, FileText, Square, Upload } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSkeleton from '../../components/LoadingSkeleton'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import logger from '../../utils/logger'
import { canUseCameraQrScanner, detectQrFromVideo, getQrScanIntervalMs } from '../../utils/qrScanner'
import { isRequestCanceled } from '../../utils/http'

const ringTone = (percentage) => {
  if (percentage >= 75) return 'var(--color-role-instructor)'
  if (percentage >= 50) return 'var(--color-role-gate)'
  return '#ef4444'
}

const progressTone = (percentage) => {
  if (percentage >= 75) return 'var(--color-role-instructor)'
  if (percentage >= 50) return '#f97316'
  return '#ef4444'
}

const AttendanceRing = ({ percentage }) => {
  const numericPercentage = Number.parseFloat(percentage) || 0
  const tone = ringTone(numericPercentage)

  return (
    <div
      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
      style={{
        '--attendance-ring-track': 'var(--color-card-border)',
        background: `conic-gradient(${tone} ${numericPercentage * 3.6}deg, var(--attendance-ring-track) 0deg)`
      }}
    >
      <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[--color-bg-card] dark:bg-slate-800 text-sm font-black text-slate-900 dark:text-slate-100 shadow-inner">
        {percentage}
      </div>
    </div>
  )
}
const StudentAttendance = () => {
  const location = useLocation()
  const [attendance, setAttendance] = useState([])
  const [summary, setSummary] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingTicketCount, setPendingTicketCount] = useState(0)
  const { showToast } = useToast()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualQrData, setManualQrData] = useState('')
  const [scannerSupported, setScannerSupported] = useState(false)
  const [scannerStatus, setScannerStatus] = useState('Tap start scanner to use your phone camera.')
  const [submittingScan, setSubmittingScan] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const detectorRef = useRef(null)
  const canvasRef = useRef(null)

  const fetchAttendance = useCallback(async (signal) => {
    try {
      setLoading(true)
      setError('')
      const [attendanceResult, ticketsResult] = await Promise.allSettled([
        api.get(`/attendance/my?page=${page}&limit=${limit}`, { signal }),
        api.get('/attendance/tickets/my', { signal })
      ])

      if (attendanceResult.status !== 'fulfilled') {
        throw attendanceResult.reason
      }

      setAttendance(attendanceResult.value.data.attendance)
      setSummary(attendanceResult.value.data.summary)
      setTotal(attendanceResult.value.data.total)

      if (ticketsResult.status === 'fulfilled') {
        setPendingTicketCount(ticketsResult.value.data.absencesWithoutTicket?.length || 0)
      } else {
        if (!isRequestCanceled(ticketsResult.reason)) {
          logger.error(ticketsResult.reason)
        }
        setPendingTicketCount(0)
      }
    } catch (fetchError) {
      if (isRequestCanceled(fetchError)) return
      logger.error(fetchError)
      setError(fetchError.response?.data?.message || 'Unable to load attendance')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [limit, page])

  const stopScanner = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    detectorRef.current = null
  }, [])

  const submitDailyQr = useCallback(async (qrData) => {
    if (!qrData) return

    try {
      setSubmittingScan(true)
      setError('')

      const res = await api.post('/attendance/scan-daily-qr', { qrData })
      const subjectList = res.data.markedSubjects.map((subject) => subject.code).join(', ')
      showToast({
        title: 'Attendance marked successfully.',
        description: subjectList ? `Recorded for ${subjectList}` : res.data.message
      })
      setManualQrData('')
      setScannerOpen(false)
      stopScanner()
      await fetchAttendance()
    } catch (requestError) {
      logger.error(requestError)
      setError(requestError.response?.data?.message || 'Unable to mark attendance')
    } finally {
      setSubmittingScan(false)
    }
  }, [fetchAttendance, showToast, stopScanner])

  const downloadAttendancePdf = async () => {
    try {
      setDownloadingPdf(true)
      setError('')

      const response = await api.get('/attendance/my/export', {
        responseType: 'blob'
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const contentDisposition = response.headers['content-disposition'] || ''
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
      link.href = url
      link.download = fileNameMatch?.[1] || 'attendance-report.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (downloadError) {
      logger.error(downloadError)
      setError('Unable to download attendance PDF right now')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const startScanner = useCallback(async () => {
    if (!scannerSupported) {
      setScannerStatus('Camera scanning is not available on this device. Use the manual QR text box below.')
      return
    }

    try {
      setScannerOpen(true)
      setScannerStatus('Opening camera...')
      setError('')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setScannerStatus('Point your camera at the college QR.')

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || submittingScan) return

        try {
          const qrValue = await detectQrFromVideo({
            video: videoRef.current,
            detectorRef,
            canvasRef
          })

          if (qrValue) {
            stopScanner()
            setScannerStatus('QR detected. Submitting attendance...')
            await submitDailyQr(qrValue)
          }
        } catch (detectError) {
          logger.error(detectError)
        }
      }, getQrScanIntervalMs())
    } catch (cameraError) {
      logger.error(cameraError)
      setScannerStatus('Unable to access the camera. You can still paste the QR data manually.')
      setError('Camera access was denied or unavailable')
      stopScanner()
    }
  }, [scannerSupported, stopScanner, submitDailyQr, submittingScan])

  useEffect(() => {
    const controller = new AbortController()
    void fetchAttendance(controller.signal)
    return () => controller.abort()
  }, [fetchAttendance])

  useEffect(() => {
    setScannerSupported(canUseCameraQrScanner())

    return () => {
      stopScanner()
    }
  }, [stopScanner])

  useEffect(() => {
    if (!scannerSupported) return

    const shouldAutoStart = location.pathname === '/student/scan' || new URLSearchParams(location.search).get('scan') === '1'
    if (shouldAutoStart) {
      void startScanner()
    }
  }, [location.pathname, location.search, scannerSupported, startScanner])

  return (
    <StudentLayout>
      <div className="student-page p-4 md:p-8">
        <PageHeader
          title={location.pathname === '/student/scan' ? 'Scan Gate QR' : 'My Attendance'}
          subtitle={location.pathname === '/student/scan'
            ? 'Use your phone camera here to scan the live rotating gate QR during your active class window.'
            : 'Track your attendance, scan the live gate QR, and review any absence tickets that need your response.'}
          breadcrumbs={['Student', 'Attendance']}
          actions={[
            { label: 'Start Scanner', icon: Camera, variant: 'primary', onClick: startScanner, disabled: submittingScan },
            { label: 'Stop', icon: Square, variant: 'secondary', onClick: () => { stopScanner(); setScannerOpen(false); setScannerStatus('Scanner stopped.') } },
            { label: submittingScan ? 'Submitting...' : 'Submit QR', icon: Upload, variant: 'secondary', onClick: () => submitDailyQr(manualQrData), disabled: !manualQrData.trim() || submittingScan },
            { label: downloadingPdf ? 'Preparing PDF...' : 'Download PDF', icon: Download, variant: 'secondary', onClick: downloadAttendancePdf, disabled: downloadingPdf },
            { label: 'Open Requests', icon: FileText, variant: 'secondary', to: '/student/requests' }
          ]}
        />

        <Alert type="error" message={error} />

        {pendingTicketCount > 0 ? (
          <div className="status-late mb-6 rounded-2xl border px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="ui-card mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm dark:shadow-slate-900/50">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">You have {pendingTicketCount} absence ticket{pendingTicketCount === 1 ? '' : 's'} waiting.</p>
                  <p className="mt-1 text-sm">
                    These absences were auto-recorded after the scan window closed. Open your requests page to add the reason.
                  </p>
                </div>
              </div>
              <Link
                to="/student/requests"
                className="status-late inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition"
              >
                <FileText className="h-4 w-4" />
                <span>Review Requests</span>
              </Link>
            </div>
          </div>
        ) : null}

        <div className="ui-card rounded-2xl p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">Live Gate QR Attendance</h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Scan the active Student QR during the time slot assigned to your semester. The code rotates every minute and works only for today.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startScanner}
                disabled={submittingScan}
                className="ui-role-fill px-4 py-2 rounded-lg transition text-sm font-medium disabled:opacity-50"
              >
                Start Scanner
              </button>
              <button
                type="button"
                onClick={() => {
                  stopScanner()
                  setScannerOpen(false)
                  setScannerStatus('Scanner stopped.')
                }}
                className="rounded-lg border border-[var(--color-card-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)]"
              >
                Stop
              </button>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-muted)] mt-4">{scannerStatus}</p>

          {scannerOpen && (
            <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
              <video ref={videoRef} className="w-full max-h-[360px] object-cover" muted playsInline />
            </div>
          )}

          <div className="mt-5 border-t border-[var(--color-card-border)] pt-5">
            <label className="mb-2 block text-sm text-[var(--color-text-muted)]">Manual QR Data</label>
            <textarea
              rows={4}
              value={manualQrData}
              onChange={(e) => setManualQrData(e.target.value)}
              placeholder="If your phone browser cannot scan live, paste the QR payload here."
              className="ui-form-input"
            />
            <button
              type="button"
              onClick={() => submitDailyQr(manualQrData)}
              disabled={!manualQrData.trim() || submittingScan}
              className="ui-role-fill mt-3 px-4 py-2 rounded-lg transition text-sm font-medium disabled:opacity-50"
            >
              {submittingScan ? 'Submitting...' : 'Submit QR'}
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} itemClassName="h-28" />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {summary.map((item, index) => (
                <div key={index} className="ui-card rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--color-heading)]">{item.subject}</h3>
                      <p className="text-xs text-[var(--color-text-muted)]">{item.code}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="ui-status-badge ui-status-success">{item.present} present</span>
                        <span className="ui-status-badge ui-status-danger">{item.absent} absent</span>
                        <span className="ui-status-badge ui-status-warning">{item.late} late</span>
                      </div>
                    </div>
                    <AttendanceRing percentage={item.percentage} />
                  </div>
                  <div className="mt-5 h-2 w-full rounded-full bg-[var(--color-surface-muted)]">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: item.percentage, backgroundColor: progressTone(parseFloat(item.percentage)) }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                    {item.present} present out of {item.total} classes
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-soft)]">
                    {item.absent} absent • {item.late} late
                  </p>
                </div>
              ))}
              {summary.length === 0 && (
                <div className="col-span-3">
                  <EmptyState
                    icon={FileText}
                    title="No attendance records yet"
                    description="Your attendance summary will appear here once a class has been recorded."
                  />
                </div>
              )}
            </div>

            {attendance.length > 0 && (
              <div className="ui-card overflow-hidden rounded-2xl">
                <div className="border-b border-[var(--color-card-border)] p-6">
                  <h2 className="text-lg font-semibold text-[var(--color-heading)]">Detailed Records</h2>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-[var(--color-surface-muted)]">
                    <tr className="text-left text-sm text-[var(--color-text-muted)]">
                      <th scope="col" className="px-6 py-4">Subject</th>
                      <th scope="col" className="px-6 py-4">Date</th>
                      <th scope="col" className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr key={record.id} className="border-t border-[var(--color-card-border)] hover:bg-[var(--color-surface-muted)]">
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-[var(--color-heading)]">{record.subject?.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{record.subject?.code}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">
                          {new Date(record.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={record.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentAttendance



