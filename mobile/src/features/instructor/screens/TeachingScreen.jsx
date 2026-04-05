import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { BookOpen, ClipboardCheck, FileStack, GraduationCap } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const items = [
  { label: 'Attendance', subtitle: 'Generate QR and mark students', icon: ClipboardCheck, route: '/instructor/attendance' },
  { label: 'Marks', subtitle: 'Manage marks and results', icon: GraduationCap, route: '/instructor/marks' },
  { label: 'Assignments', subtitle: 'Create and review tasks', icon: FileStack, route: '/instructor/assignments' },
  { label: 'Subjects', subtitle: 'Open your assigned subjects', icon: BookOpen, route: '/instructor/subjects' }
]

const TeachingScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader eyebrow="Teaching" title="Teaching tools" subtitle="Open the main academic tools you use every day." />
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
      <AppCard>
        <Text style={[styles.tipTitle, { color: palette.text }]}>Simple flow</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Use Home for the fastest shortcuts, Teaching for core academic work, Services for routine, notices, and requests.</Text>
      </AppCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  tipTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 }
})

export default TeachingScreen
