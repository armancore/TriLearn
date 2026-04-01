import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import StudentLayout from '../../layouts/StudentLayout'
import api from '../../utils/api'
import Alert from '../../components/Alert'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import logger from '../../utils/logger'
const StudentAttendance = () => {
  const location = useLocation()
  const [attendance, setAttendance] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
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
  }, [])

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
      const res = await api.get('/attendance/my')
      setAttendance(res.data.attendance)
      setSummary(res.data.summary)
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
      setSuccess(subjectList ? `Attendance marked for ${subjectList}` : res.data.message)
      setManualQrData('')
      setScannerOpen(false)
      stopScanner()
      await fetchAttendance()
      setTimeout(() => setSuccess(''), 4000)
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
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">{location.pathname === '/student/scan' ? 'Scan Gate QR' : 'My Attendance'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {location.pathname === '/student/scan'
              ? 'Your camera opens here for mobile phones and laptops so you can scan the gate QR quickly.'
              : 'Track your attendance and scan the daily entry QR from your phone.'}
          </p>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Daily QR Attendance</h2>
              <p className="text-sm text-gray-500 mt-1">
                Scan the entrance QR and we&apos;ll mark attendance for all of your enrolled routine subjects scheduled today.
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
                <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">{item.subject}</h3>
                      <p className="text-xs text-gray-500">{item.code}</p>
                    </div>
                    <span className={`text-2xl font-bold ${
                      parseFloat(item.percentage) >= 75 ? 'text-green-600' :
                      parseFloat(item.percentage) >= 50 ? 'text-orange-500' :
                      'text-red-600'}`}>
                      {item.percentage}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        parseFloat(item.percentage) >= 75 ? 'bg-green-500' :
                        parseFloat(item.percentage) >= 50 ? 'bg-orange-500' :
                        'bg-red-500'}`}
                      style={{ width: item.percentage }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {item.present} present out of {item.total} classes
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {item.absent} absent • {item.late} late
                  </p>
                </div>
              ))}
              {summary.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-400">
                  No attendance records yet
                </div>
              )}
            </div>

            {attendance.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                  <h2 className="text-lg font-semibold text-gray-800">Detailed Records</h2>
                </div>
                <table className="w-full">
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
            )}
          </>
        )}
      </div>
    </StudentLayout>
  )
}

export default StudentAttendance



