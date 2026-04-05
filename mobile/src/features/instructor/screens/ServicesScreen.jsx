import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, BookOpen, CalendarDays, MessageSquare } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const items = [
  { label: 'Routine', subtitle: 'See your teaching schedule', icon: CalendarDays, route: '/instructor/routine' },
  { label: 'Notices', subtitle: 'Read institution notices', icon: Bell, route: '/instructor/notices' },
  { label: 'Materials', subtitle: 'Open study materials', icon: BookOpen, route: '/instructor/materials' },
  { label: 'Requests', subtitle: 'Review student requests', icon: MessageSquare, route: '/instructor/requests' }
]

const ServicesScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader eyebrow="Services" title="Instructor services" subtitle="Open daily service screens without crowding the bottom navigation." />
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
