import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, CalendarDays, ClipboardCheck, CreditCard, LibraryBig, Ticket } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const serviceItems = [
  { label: 'Attendance', subtitle: 'Scan QR and view attendance', icon: ClipboardCheck, route: '/student/attendance' },
  { label: 'Notices', subtitle: 'Read college updates', icon: Bell, route: '/student/notices' },
  { label: 'Routine', subtitle: 'See class schedule', icon: CalendarDays, route: '/student/routine' },
  { label: 'Tickets', subtitle: 'Create and track absence tickets', icon: Ticket, route: '/student/tickets' },
  { label: 'ID Card', subtitle: 'Open your card', icon: CreditCard, route: '/student/id-card' },
  { label: 'Materials', subtitle: 'Open shared files', icon: LibraryBig, route: '/student/materials' }
]

const ServicesScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader
        eyebrow="Services"
        title="Student services and tools"
        subtitle="Open attendance, notices, routine, tickets, and student services from here."
      />

      <View style={styles.grid}>
        {serviceItems.map(({ label, subtitle, icon: Icon, route }) => (
          <Pressable
            key={label}
            style={[styles.cardWrap, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={() => router.push(route)}
          >
            <View style={[styles.iconWrap, { backgroundColor: palette.primarySoft }]}>
              <Icon color={palette.primary} size={22} />
            </View>
            <Text style={[styles.title, { color: palette.text }]}>{label}</Text>
            <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <AppCard>
        <Text style={[styles.tipTitle, { color: palette.text }]}>Keep it simple</Text>
        <Text style={[styles.tipText, { color: palette.textMuted }]}>
          Home gives you the most-used shortcuts, Learning keeps academic items together, and Services covers attendance and student support tools.
        </Text>
      </AppCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  cardWrap: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 15,
    fontWeight: '800'
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20
  }
})

export default ServicesScreen
