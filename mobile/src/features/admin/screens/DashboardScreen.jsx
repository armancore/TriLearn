import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, Building2, CalendarDays, LogOut, ShieldCheck, Users } from 'lucide-react-native'
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

const AdminDashboardScreen = () => {
  const { user, logout } = useAuth()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const router = useRouter()
  const { data, loading, execute } = useApi({ initialData: null })

  useEffect(() => {
    void execute((signal) => api.get('/admin/stats', { signal }))
  }, [])

  const stats = [
    { label: 'Users', value: data?.totalUsers ?? '-' },
    { label: 'Students', value: data?.totalStudents ?? '-' },
    { label: 'Departments', value: data?.totalDepartments ?? '-' }
  ]

  const shortcuts = [
    { label: 'Users', icon: Users, route: '/admin/users', primary: true },
    { label: 'Departments', icon: Building2, route: '/admin/departments' },
    { label: 'Notices', icon: Bell, route: '/admin/notices' },
    { label: 'Routine', icon: CalendarDays, route: '/admin/routine' },
    { label: 'Management', icon: ShieldCheck, route: '/admin/management' },
    { label: 'Logout', icon: LogOut, action: logout }
  ]

  return (
    <Screen>
      <PageHeader eyebrow="Home" title="Admin home" subtitle="Keep institution-wide tools simple and easy to reach." />
      {loading ? <LoadingSpinner /> : null}
      <RoleOverview user={user} stats={stats} />

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

      <AppCard>
        <Text style={[styles.noteTitle, { color: palette.text }]}>Clean structure</Text>
        <Text style={[styles.noteText, { color: palette.textMuted }]}>Home gives your fastest shortcuts. Management and Services keep the rest organized without crowding the bottom bar.</Text>
      </AppCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shortcut: { width: '31%', borderWidth: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  shortcutText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  noteTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  noteText: { fontSize: 14, lineHeight: 20 }
})

export default AdminDashboardScreen
