import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import colors from '../../constants/colors'
import { spacing } from '../../constants/layout'

const PageHeader = ({ title, subtitle, right, eyebrow }) => {
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? (
          <View style={[styles.badge, { backgroundColor: palette.primarySoft, borderColor: palette.border }]}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16
  },
  copy: {
    flex: 1,
    gap: 6
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.xs
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  title: {
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22
  }
})

export default PageHeader
