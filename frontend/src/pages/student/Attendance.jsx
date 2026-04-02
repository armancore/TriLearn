import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, FileText, Square, Upload } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import PageHeader from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import logger from '../../utils/logger'

const ringTone = (percentage) => {
  if (percentage >= 75) return 'var(--color-role-instructor)'
  if (percentage >= 50) return 'var(--color-role-gate)'
  return '#ef4444'
}

const AttendanceRing = ({ percentage }) => {
  const numericPercentage = Number.parseFloat(percentage) || 0
  const tone = ringTone(numericPercentage)

  return (
    <div
      className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${tone} ${numericPercentage * 3.6}deg, rgba(226,232,240,0.9) 0deg)`
      }}
    >
      <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white text-sm font-black text-slate-900 shadow-inner">
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

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    fetchAttendance()
  }, [page])

  useEffect(() => {
    setScannerSupported(
      typeof window !== 'undefined' &&
      'BarcodeDetector' in window &&
      !!navigator.mediaDevices?.getUserMedia
    )

    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (!scannerSupported) return

    const shouldAutoStart = location.pathname === '/student/scan' || new URLSearchParams(location.search).get('scan') === '1'
    if (shouldAutoStart) {
      startScanner()
    }
  }, [location.pathname, location.search, scannerSupported])

  const fetchAttendance = async () => {
    try {
      setError('')
      const [attendanceRes, ticketsRes] = await Promise.all([
        api.get(`/attendance/my?page=${page}&limit=${limit}`),
        api.get('/attendance/tickets/my')
      ])
      setAttendance(attendanceRes.data.attendance)
      setSummary(attendanceRes.data.summary)
      setTotal(attendanceRes.data.total)
      setPendingTicketCount(ticketsRes.data.absencesWithoutTicket?.length || 0)
    } catch (fetchError) {
      logger.error(fetchError)
      setError(fetchError.response?.data?.message || 'Unable to load attendance')
    } finally {
      setLoading(false)
    }
  }

  const stopScanner = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const submitDailyQr = async (qrData) => {
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
  }

  const startScanner = async () => {
    if (!scannerSupported) {
      setScannerStatus('Live camera scanning is not supported on this device. Use the manual QR text box below.')
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

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      setScannerStatus('Point your camera at the college QR.')

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || submittingScan) return

        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0 && codes[0].rawValue) {
            stopScanner()
            setScannerStatus('QR detected. Submitting attendance...')
            await submitDailyQr(codes[0].rawValue)
          }
        } catch (detectError) {
          logger.error(detectError)
        }
      }, 800)
    } catch (cameraError) {
      logger.error(cameraError)
      setScannerStatus('Unable to access the camera. You can still paste the QR data manually.')
      setError('Camera access was denied or unavailable')
      stopScanner()
    }
  }

  return (
    <StudentLayout>
      <div className="p-4 md:p-8">
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
            { label: 'Open Tickets', icon: FileText, variant: 'secondary', to: '/student/tickets' }
          ]}
        />

        <Alert type="error" message={error} />

        {pendingTicketCount > 0 ? (
          <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-amber-900">You have {pendingTicketCount} absence ticket{pendingTicketCount === 1 ? '' : 's'} waiting.</p>
                  <p className="mt-1 text-sm text-amber-700">
                    These absences were auto-recorded after the scan window closed. Open your tickets page to add the reason.
                  </p>
                </div>
              </div>
              <Link
                to="/student/tickets"
                className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
              >
                <FileText className="h-4 w-4" />
                <span>Review Tickets</span>
              </Link>
            </div>
          </div>
        ) : null}

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Live Gate QR Attendance</h2>
              <p className="text-sm text-gray-500 mt-1">
                Scan the active gate QR during your class window. The code rotates every minute and only works for your scheduled routine period.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startScanner}
                disabled={submittingScan}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm font-medium disabled:opacity-50"
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
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
              >
                Stop
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-4">{scannerStatus}</p>

          {scannerOpen && (
            <div className="mt-4 overflow-hidden rounded-2xl border bg-black">
              <video ref={videoRef} className="w-full max-h-[360px] object-cover" muted playsInline />
            </div>
          )}

          <div className="mt-5 pt-5 border-t">
            <label className="block text-sm text-gray-600 mb-2">Manual QR Data</label>
            <textarea
              rows={4}
              value={manualQrData}
              onChange={(e) => setManualQrData(e.target.value)}
              placeholder="If your phone browser cannot scan live, paste the QR payload here."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={() => submitDailyQr(manualQrData)}
              disabled={!manualQrData.trim() || submittingScan}
              className="mt-3 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition text-sm font-medium disabled:opacity-50"
            >
              {submittingScan ? 'Submitting...' : 'Submit QR'}
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner text="Loading attendance..." />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {summary.map((item, index) => (
                <div key={index} className="ui-card rounded-2xl p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-800">{item.subject}</h3>
                      <p className="text-xs text-gray-500">{item.code}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="ui-status-badge ui-status-success">{item.present} present</span>
                        <span className="ui-status-badge ui-status-danger">{item.absent} absent</span>
                        <span className="ui-status-badge ui-status-warning">{item.late} late</span>
                      </div>
                    </div>
                    <AttendanceRing percentage={item.percentage} />
                  </div>
                  <div className="mt-5 w-full rounded-full bg-gray-200 h-2">
                    <div
                      className={`h-2 rounded-full ${
                        parseFloat(item.percentage) >= 75 ? 'bg-green-500' :
                        parseFloat(item.percentage) >= 50 ? 'bg-orange-500' :
                        'bg-red-500'}`}
                      style={{ width: item.percentage }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    {item.present} present out of {item.total} classes
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {item.absent} absent • {item.late} late
                  </p>
                </div>
              ))}
              {summary.length === 0 && (
                <div className="col-span-3">
                  <EmptyState
                    icon="📊"
                    title="No attendance records yet"
                    description="Your attendance summary will appear here once a class has been recorded."
                  />
                </div>
              )}
            </div>

            {attendance.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold text-gray-800">Detailed Records</h2>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-sm text-gray-500">
                      <th className="px-6 py-4">Subject</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr key={record.id} className="border-t hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-800 text-sm">{record.subject?.name}</p>
                          <p className="text-xs text-gray-500">{record.subject?.code}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
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



