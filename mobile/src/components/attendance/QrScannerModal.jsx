import { Modal, StyleSheet, Text, View } from 'react-native'
import { CameraView } from 'expo-camera'
import AppButton from '../common/AppButton'
import { useTheme } from '../../context/ThemeContext'
import colors from '../../constants/colors'
import { radius, spacing } from '../../constants/layout'

const QrScannerModal = ({ visible, onClose, onScan, enabled = true }) => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: palette.primarySoft, borderColor: palette.border }]}>
            <Text style={[styles.badgeText, { color: palette.primary }]}>Attendance Scanner</Text>
          </View>
          <Text style={[styles.title, { color: palette.text }]}>Point your camera at the class QR code</Text>
          <Text style={[styles.note, { color: palette.textMuted }]}>Keep the code inside the frame. The scan happens automatically.</Text>
        </View>
        <View style={[styles.cameraWrap, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={enabled ? onScan : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ['qr']
            }}
          />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={[styles.scanFrame, { borderColor: palette.white }]} />
          </View>
        </View>
        <AppButton title="Close" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg
  },
  header: {
    gap: spacing.sm
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  title: {
    fontSize: 28,
    fontWeight: '800'
  },
  cameraWrap: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1
  },
  camera: {
    flex: 1
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 13, 24, 0.2)'
  },
  scanFrame: {
    width: '68%',
    aspectRatio: 1,
    borderWidth: 3,
    borderRadius: 28
  },
  note: {
    fontSize: 14,
    lineHeight: 21
  }
})

export default QrScannerModal
