import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, CalendarDays } from 'lucide-react-native'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const items = [
  { label: 'Notices', subtitle: 'Review institution notices', icon: Bell, route: '/admin/notices' },
  { label: 'Routine', subtitle: 'Open routine management', icon: CalendarDays, route: '/admin/routine' }
]

const ServicesScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader eyebrow="Services" title="Admin services" subtitle="Routine and notices live here so the main navigation stays clean." />
      <View style={styles.grid}>
        {items.map(({ label, subtitle, icon: Icon, route }) => (
          <Pressable key={label} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={() => router.push(route)}>
            <View style={[styles.iconWrap, { backgroundColor: palette.primarySoft }]}>
              <Icon color={palette.primary} size={22} />
            </View>
            <Text style={[styles.title, { color: palette.text }]}>{label}</Text>
            <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19 }
})

export default ServicesScreen
