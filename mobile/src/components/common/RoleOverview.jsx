import { StyleSheet, Text, View } from 'react-native'
import AppCard from './AppCard'
import { useTheme } from '../../context/ThemeContext'
import colors from '../../constants/colors'
import { ROLE_LABELS } from '../../constants/roles'
import { spacing } from '../../constants/layout'

const RoleOverview = ({ user, stats = [] }) => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <AppCard style={[styles.card, { backgroundColor: palette.primaryStrong, borderColor: palette.primaryStrong }]}>
      <Text style={[styles.kicker, { color: palette.white }]}>TriLearn</Text>
      <Text style={[styles.welcome, { color: palette.white }]}>Welcome back, {user?.name || 'User'}</Text>
      <Text style={[styles.role, { color: 'rgba(255,255,255,0.8)' }]}>{ROLE_LABELS[user?.role] || 'TriLearn Member'}</Text>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={[styles.stat, { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={[styles.value, { color: palette.white }]}>{stat.value}</Text>
            <Text style={[styles.label, { color: 'rgba(255,255,255,0.72)' }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </AppCard>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  welcome: {
    fontSize: 22,
    fontWeight: '800'
  },
  role: {
    marginTop: 6,
    fontSize: 14
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    gap: 16
  },
  stat: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  value: {
    fontSize: 24,
    fontWeight: '800'
  },
  label: {
    marginTop: 4,
    fontSize: 12
  }
})

export default RoleOverview
