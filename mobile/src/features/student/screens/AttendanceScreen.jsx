import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Camera } from 'expo-camera'
import { CheckCircle2, ScanLine } from 'lucide-react-native'
import AttendanceSummary from '../../../components/attendance/AttendanceSummary'
import QrScannerModal from '../../../components/attendance/QrScannerModal'
import ResourceScreen from '../../../components/common/ResourceScreen'
import AttendanceCard from '../../../components/attendance/AttendanceCard'
import AppCard from '../../../components/common/AppCard'
import AppButton from '../../../components/common/AppButton'
import useApi from '../../../hooks/useApi'
import api from '../../../utils/api'
import { getFriendlyErrorMessage } from '../../../utils/errors'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'
import { spacing } from '../../../constants/layout'

const StudentAttendanceScreen = () => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const { data, loading, error, execute } = useApi({ initialData: [] })
  const [scannerVisible, setScannerVisible] = useState(false)
  const [scanEnabled, setScanEnabled] = useState(true)
  const [scanResult, setScanResult] = useState({ visible: false, title: '', message: '', success: true })
  const [summary, setSummary] = useState({ total: 0, present: 0, absent: 0 })

  useEffect(() => {
    void Camera.requestCameraPermissionsAsync()
    void execute((signal) => api.get('/attendance/my', { signal }), {
      transform: (response) => response.data?.attendance || []
    })
  }, [])

  useEffect(() => {
    const records = data || []
    setSummary({
      total: records.length,
      present: records.filter((item) => item.status === 'PRESENT').length,
      absent: records.filter((item) => item.status === 'ABSENT').length
    })
  }, [data])

  const handleScan = async ({ data: qrData }) => {
    if (!scanEnabled) {
      return
    }

    setScanEnabled(false)

    try {
      const response = await api.post('/attendance/scan-qr', { qrData })
      setScanResult({
        visible: true,
        title: 'Attendance recorded',
        message: response.data?.message || 'Your attendance has been recorded successfully.',
        success: true
      })
    } catch {
      try {
        const response = await api.post('/attendance/scan-daily-qr', { qrData })
        setScanResult({
          visible: true,
          title: 'Attendance recorded',
          message: response.data?.message || 'Your daily attendance has been recorded successfully.',
          success: true
        })
      } catch (dailyError) {
        setScanResult({
          visible: true,
          title: 'Scan not completed',
          message: getFriendlyErrorMessage(dailyError),
          success: false
        })
      }
    } finally {
      setTimeout(() => setScanEnabled(true), 1500)
      setScannerVisible(false)
      void execute((signal) => api.get('/attendance/my', { signal }), {
        transform: (response) => response.data?.attendance || []
      })
    }
  }

  const refresh = () => execute((signal) => api.get('/attendance/my', { signal }), {
    transform: (response) => response.data?.attendance || []
  })

  return (
    <>
      <ResourceScreen
        title="Attendance"
        subtitle="Use one scanner action for class or gate QR codes, then review your attendance history."
        items={data}
        loading={loading}
        error={error}
        onRefresh={refresh}
        beforeList={(
          <>
            <AttendanceSummary {...summary} />
            <AppCard style={[styles.scanCard, { backgroundColor: palette.primary, borderColor: palette.primary }]}>
              <View style={styles.scanCopy}>
                <View style={[styles.scanIconWrap, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                  <ScanLine color={palette.white} size={22} />
                </View>
                <View style={styles.scanTextWrap}>
                  <Text style={[styles.scanTitle, { color: palette.white }]}>Scan attendance</Text>
                  <Text style={[styles.scanText, { color: 'rgba(255,255,255,0.82)' }]}>
                    Use the scanner for class or gate QR codes. One action, one confirmation.
                  </Text>
                </View>
              </View>
              <Pressable style={[styles.scanButton, { backgroundColor: palette.white }]} onPress={() => setScannerVisible(true)}>
                <Text style={[styles.scanButtonLabel, { color: palette.primary }]}>Open scanner</Text>
              </Pressable>
            </AppCard>
          </>
        )}
        renderItem={({ item }) => <AttendanceCard item={item} />}
        keyExtractor={(item, index) => String(item?.id || index)}
        emptyTitle="No attendance records yet"
        emptyDescription="Attendance history will appear here after your first class scan."
      />

      <QrScannerModal visible={scannerVisible} onClose={() => setScannerVisible(false)} onScan={handleScan} enabled={scanEnabled} />

      <Modal transparent animationType="fade" visible={scanResult.visible} onRequestClose={() => setScanResult((current) => ({ ...current, visible: false }))}>
        <View style={[styles.resultBackdrop, { backgroundColor: palette.overlay }]}>
          <AppCard style={styles.resultCard}>
            <View style={[styles.resultIconWrap, { backgroundColor: scanResult.success ? palette.primarySoft : palette.surfaceMuted }]}>
              <CheckCircle2 color={scanResult.success ? palette.primary : palette.warning} size={28} />
            </View>
            <Text style={[styles.resultTitle, { color: palette.text }]}>{scanResult.title}</Text>
            <Text style={[styles.resultText, { color: palette.textMuted }]}>{scanResult.message}</Text>
            <AppButton title="Done" onPress={() => setScanResult((current) => ({ ...current, visible: false }))} />
          </AppCard>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  scanCard: {
    gap: 16
  },
  scanCopy: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center'
  },
  scanIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanTextWrap: {
    flex: 1,
    gap: 4
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  scanText: {
    fontSize: 13,
    lineHeight: 19
  },
  scanButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  scanButtonLabel: {
    fontSize: 14,
    fontWeight: '800'
  },
  resultBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  resultCard: {
    alignItems: 'center',
    gap: 14
  },
  resultIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center'
  },
  resultText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center'
  }
})

export default StudentAttendanceScreen
