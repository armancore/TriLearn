import { StyleSheet, Text, View } from 'react-native'
import AppCard from '../common/AppCard'
import { useTheme } from '../../context/ThemeContext'
import colors from '../../constants/colors'
import { spacing } from '../../constants/layout'

const AttendanceSummary = ({ total = 0, present = 0, absent = 0 }) => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <AppCard>
      <Text style={[styles.heading, { color: palette.text }]}>Attendance Overview</Text>
      <Text style={[styles.subheading, { color: palette.textMuted }]}>Your latest attendance status at a glance.</Text>
      <View style={styles.grid}>
        <View style={[styles.metric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.value, { color: palette.text }]}>{total}</Text>
          <Text style={[styles.label, { color: palette.textMuted }]}>Total</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.value, { color: palette.success }]}>{present}</Text>
          <Text style={[styles.label, { color: palette.textMuted }]}>Present</Text>
        </View>
        <View style={[styles.metric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.value, { color: palette.danger }]}>{absent}</Text>
          <Text style={[styles.label, { color: palette.textMuted }]}>Absent</Text>
        </View>
      </View>
    </AppCard>
  )
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  subheading: {
    fontSize: 13,
    marginBottom: 14
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  metric: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 16
  },
  value: {
    fontSize: 28,
    fontWeight: '800'
  },
  label: {
    marginTop: 4,
    fontSize: 13
  }
})

export default AttendanceSummary
