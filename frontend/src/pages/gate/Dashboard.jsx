import { useState } from 'react'
import GateLayout from '../../layouts/GateLayout'
import api from '../../utils/api'
import { getFriendlyErrorMessage } from '../../utils/errors'
import logger from '../../utils/logger'
const GateDashboard = () => {
  const [dailyQrCode, setDailyQrCode] = useState('')
  const [qrExpiry, setQrExpiry] = useState('')
  const [cutoffAt, setCutoffAt] = useState('')
  const [firstClassStart, setFirstClassStart] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateDailyQr = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await api.post('/attendance/generate-daily-qr')
      setDailyQrCode(res.data.qrCode)
      setQrExpiry(res.data.expiresIn)
      setFirstClassStart(res.data.firstClassStart)
      setCutoffAt(new Date(res.data.cutoffAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch (requestError) {
      logger.error(requestError)
      setError(getFriendlyErrorMessage(requestError, 'Unable to generate the gate QR right now.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GateLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Gate Attendance QR</h1>
          <p className="text-gray-500 text-sm mt-1">Generate the fixed gate QR for today&apos;s entry attendance window.</p>
        </div>

        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-3xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Daily Gate QR</h2>
              <p className="text-sm text-gray-500 mt-1">
                Students may scan only until 30 minutes after the first class starts. After that, instructors must mark attendance manually.
              </p>
            </div>
            <button
              onClick={generateDailyQr}
              disabled={loading}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Gate QR'}
            </button>
          </div>

          {dailyQrCode && (
            <div className="flex flex-col items-center">
              <img src={dailyQrCode} alt="Gate attendance QR" className="rounded-2xl border" style={{ width: 280 }} />
              <div className="mt-4 text-center text-sm text-gray-600 space-y-1">
                <p>First class starts at <span className="font-semibold text-gray-800">{firstClassStart}</span></p>
                <p>Student self-scan closes at <span className="font-semibold text-red-600">{cutoffAt}</span></p>
                <p className="text-xs text-gray-500">Window: {qrExpiry}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </GateLayout>
  )
}

export default GateDashboard



