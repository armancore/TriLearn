import { useEffect, useState } from 'react'
import { Image, Modal, StyleSheet, Text, View } from 'react-native'
import { Camera } from 'expo-camera'
import { CheckCircle2, QrCode } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import AppButton from '../../../components/common/AppButton'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import QrScannerModal from '../../../components/attendance/QrScannerModal'
import LoadingSpinner from '../../../components/common/LoadingSpinner'
import api from '../../../utils/api'
import { getFriendlyErrorMessage } from '../../../utils/errors'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'
import { spacing } from '../../../constants/layout'

const GatekeeperScannerScreen = () => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const [scannerVisible, setScannerVisible] = useState(false)
  const [result, setResult] = useState(null)
  const [resultVisible, setResultVisible] = useState(false)
  const [qrState, setQrState] = useState({ loading: true, error: '', data: null })

  const loadGateQr = async () => {
    try {
      setQrState((current) => ({ ...current, loading: true, error: '' }))
      const response = await api.get('/attendance/gatekeeper/live-qr')
      setQrState({
        loading: false,
        error: '',
        data: response.data
      })
    } catch (error) {
      setQrState({
        loading: false,
        error: getFriendlyErrorMessage(error, 'Unable to load the gate QR right now.'),
        data: null
      })
    }
  }

  useEffect(() => {
    void Camera.requestCameraPermissionsAsync()
    void loadGateQr()
  }, [])

  useEffect(() => {
    if (!qrState.data?.active || !qrState.data?.refreshInSeconds) {
      return undefined
    }

    const timeout = setTimeout(() => {
      void loadGateQr()
    }, Math.max(5, qrState.data.refreshInSeconds) * 1000)

    return () => clearTimeout(timeout)
  }, [qrState.data?.active, qrState.data?.refreshInSeconds])

  const handleScan = async ({ data }) => {
    try {
      const response = await api.post('/attendance/scan-student-id', { qrData: data })
      setResult(response.data)
      setResultVisible(true)
    } catch (error) {
      setResult({
        message: getFriendlyErrorMessage(error),
        student: null
      })
      setResultVisible(true)
    } finally {
      setScannerVisible(false)
    }
  }

  const activePeriods = qrState.data?.periods || []
  const nextWindow = qrState.data?.nextWindow

  return (
    <>
      <Screen>
        <PageHeader eyebrow="Gate" title="Gatekeeper scanner and live QR" subtitle="Show the rotating gate QR to students and scan student IDs from the same screen." />

        <AppCard style={[styles.qrCard, { backgroundColor: palette.primary, borderColor: palette.primary }]}>
          <View style={styles.rowBetween}>
            <View style={styles.copy}>
              <Text style={[styles.qrLabel, { color: palette.white }]}>Live gate QR</Text>
              <Text style={[styles.qrTitle, { color: palette.white }]}>Student attendance QR</Text>
            </View>
            <AppButton title="Refresh" variant="secondary" onPress={loadGateQr} style={styles.refreshButton} />
          </View>

          {qrState.loading ? <LoadingSpinner /> : null}

          {!qrState.loading && qrState.data?.active && qrState.data?.qrCode ? (
            <>
              <View style={[styles.qrWrap, { backgroundColor: palette.white }]}>
                <Image source={{ uri: qrState.data.qrCode }} style={styles.qrImage} resizeMode="contain" />
              </View>
              <Text style={[styles.qrMeta, { color: 'rgba(255,255,255,0.82)' }]}>
                Expires: {qrState.data.expiresAt ? new Date(qrState.data.expiresAt).toLocaleTimeString() : 'Soon'}
              </Text>
              {activePeriods.length ? (
                <Text style={[styles.qrMeta, { color: 'rgba(255,255,255,0.82)' }]}>
                  Active window: {activePeriods.map((period) => period.title).join(', ')}
                </Text>
              ) : null}
            </>
          ) : null}

          {!qrState.loading && !qrState.data?.active ? (
            <View style={[styles.inactiveBox, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
              <QrCode color={palette.white} size={24} />
              <Text style={[styles.inactiveTitle, { color: palette.white }]}>No active QR right now</Text>
              <Text style={[styles.inactiveText, { color: 'rgba(255,255,255,0.82)' }]}>
                {nextWindow
                  ? `Next window starts at ${new Date(nextWindow.startsAt).toLocaleTimeString()}.`
                  : qrState.data?.holiday
                    ? 'Today is marked as a holiday.'
                    : 'There is no active attendance window right now.'}
              </Text>
            </View>
          ) : null}

          {qrState.error ? (
            <Text style={[styles.qrMeta, { color: palette.white }]}>{qrState.error}</Text>
          ) : null}
        </AppCard>

        <AppCard style={styles.scanCard}>
          <Text style={[styles.scanTitle, { color: palette.text }]}>Scan student ID</Text>
          <Text style={[styles.scanText, { color: palette.textMuted }]}>Use this for direct gate attendance marking from a student ID QR.</Text>
          <AppButton title="Open scanner" onPress={() => setScannerVisible(true)} />
        </AppCard>
      </Screen>

      <QrScannerModal visible={scannerVisible} onClose={() => setScannerVisible(false)} onScan={handleScan} />

      <Modal transparent animationType="fade" visible={resultVisible} onRequestClose={() => setResultVisible(false)}>
        <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
          <AppCard style={styles.resultCard}>
            <View style={[styles.iconWrap, { backgroundColor: palette.primarySoft }]}>
              <CheckCircle2 color={palette.primary} size={28} />
            </View>
            <Text style={[styles.resultTitle, { color: palette.text }]}>{result?.message || 'Scan complete'}</Text>
            {result?.student?.name ? <Text style={[styles.resultMeta, { color: palette.textMuted }]}>{result.student.name}</Text> : null}
            {result?.student?.rollNumber ? <Text style={[styles.resultMeta, { color: palette.textMuted }]}>{result.student.rollNumber}</Text> : null}
            <AppButton title="Done" onPress={() => setResultVisible(false)} />
          </AppCard>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  qrCard: {
    gap: 12
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  copy: {
    flex: 1,
    gap: 4
  },
  qrLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  qrTitle: {
    fontSize: 22,
    fontWeight: '800'
  },
  refreshButton: {
    minWidth: 110
  },
  qrWrap: {
    alignSelf: 'center',
    borderRadius: 24,
    padding: 16
  },
  qrImage: {
    width: 220,
    height: 220
  },
  qrMeta: {
    fontSize: 13,
    lineHeight: 19
  },
  inactiveBox: {
    borderRadius: 20,
    padding: 16,
    gap: 8,
    alignItems: 'flex-start'
  },
  inactiveTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  inactiveText: {
    fontSize: 13,
    lineHeight: 19
  },
  scanCard: {
    gap: 10
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  scanText: {
    fontSize: 14,
    lineHeight: 20
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  resultCard: {
    alignItems: 'center',
    gap: 12
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center'
  },
  resultMeta: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  }
})

export default GatekeeperScannerScreen
