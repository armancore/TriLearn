import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, CalendarDays, ClipboardCheck, FileStack, GraduationCap, LogOut } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import RoleOverview from '../../../components/common/RoleOverview'
import Screen from '../../../components/common/Screen'
import LoadingSpinner from '../../../components/common/LoadingSpinner'
import useApi from '../../../hooks/useApi'
import api from '../../../utils/api'
import { useAuth } from '../../../context/AuthContext'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const toArray = (value) => (Array.isArray(value) ? value : [])

const InstructorDashboardScreen = () => {
  const { user, logout } = useAuth()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const router = useRouter()
  const { data, loading, execute } = useApi({ initialData: [] })
  const [assignments, setAssignments] = useState([])

  useEffect(() => {
    void execute((signal) => api.get('/subjects', { signal }), {
      transform: (response) => response.data?.subjects || response.data || []
    })
    void api.get('/assignments').then((response) => {
      setAssignments(Array.isArray(response.data?.assignments) ? response.data.assignments : toArray(response.data))
    }).catch(() => null)
  }, [])

  const shortcuts = [
    { label: 'Attendance', icon: ClipboardCheck, route: '/instructor/attendance', primary: true },
    { label: 'Marks', icon: GraduationCap, route: '/instructor/marks' },
    { label: 'Assignments', icon: FileStack, route: '/instructor/assignments' },
    { label: 'Routine', icon: CalendarDays, route: '/instructor/routine' },
    { label: 'Notices', icon: Bell, route: '/instructor/notices' },
    { label: 'Logout', icon: LogOut, action: logout }
  ]

  return (
    <Screen>
      <PageHeader eyebrow="Home" title="Instructor home" subtitle="Open your most-used teaching tools quickly." />
      {loading ? <LoadingSpinner /> : null}
      <RoleOverview user={user} stats={[{ label: 'Subjects', value: data?.length || 0 }, { label: 'Assignments', value: assignments.length }]} />

      <AppCard style={[styles.hero, { backgroundColor: palette.primary, borderColor: palette.primary }]}>
        <Text style={[styles.heroLabel, { color: palette.white }]}>Teaching</Text>
        <Text style={[styles.heroTitle, { color: palette.white }]}>Start from attendance</Text>
        <Pressable style={[styles.heroButton, { backgroundColor: palette.white }]} onPress={() => router.push('/instructor/attendance')}>
          <Text style={[styles.heroButtonText, { color: palette.primary }]}>Open attendance</Text>
        </Pressable>
      </AppCard>

      <View style={styles.grid}>
        {shortcuts.map(({ label, icon: Icon, route, action, primary }) => (
          <Pressable
            key={label}
            style={[styles.shortcut, { backgroundColor: primary ? palette.surfaceStrong : palette.surface, borderColor: primary ? palette.surfaceStrong : palette.border }]}
            onPress={() => {
              if (action) {
                void action()
                return
              }
              router.push(route)
            }}
          >
            <View style={[styles.iconWrap, { backgroundColor: primary ? 'rgba(255,255,255,0.16)' : palette.primarySoft }]}>
              <Icon color={primary ? palette.white : palette.primary} size={20} />
            </View>
            <Text style={[styles.shortcutText, { color: primary ? palette.white : palette.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { gap: 10 },
  heroLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroButton: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
  heroButtonText: { fontSize: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shortcut: { width: '31%', borderWidth: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { fontSize: 13, fontWeight: '700', textAlign: 'center' }
})

export default InstructorDashboardScreen
