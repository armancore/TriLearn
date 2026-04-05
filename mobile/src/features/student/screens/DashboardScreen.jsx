import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Bell, BookOpen, CalendarDays, ClipboardCheck, CreditCard, FileStack, GraduationCap, LibraryBig, LogOut, Ticket } from 'lucide-react-native'
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

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.attendance)) return value.attendance
  if (Array.isArray(value?.marks)) return value.marks
  if (Array.isArray(value?.notices)) return value.notices
  if (Array.isArray(value?.assignments)) return value.assignments
  return []
}

const StudentDashboardScreen = () => {
  const { user, logout } = useAuth()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const router = useRouter()
  const { data, loading, execute } = useApi({ initialData: null })
  const [attendanceData, setAttendanceData] = useState([])
  const [marksData, setMarksData] = useState([])
  const [noticesData, setNoticesData] = useState([])
  const [assignmentsData, setAssignmentsData] = useState([])

  useEffect(() => {
    void execute((signal) => api.get('/auth/me', { signal }))
    void api.get('/attendance/my').then((response) => setAttendanceData(toArray(response.data))).catch(() => null)
    void api.get('/marks/my').then((response) => setMarksData(toArray(response.data))).catch(() => null)
    void api.get('/notices').then((response) => setNoticesData(toArray(response.data))).catch(() => null)
    void api.get('/assignments').then((response) => setAssignmentsData(toArray(response.data))).catch(() => null)
  }, [])

  const student = data?.user?.student
  const stats = [
    { label: 'Semester', value: student?.semester ?? '-' },
    { label: 'Section', value: student?.section || '-' },
    { label: 'Department', value: student?.department || '-' }
  ]

  const shortcuts = [
    { label: 'Scan QR', icon: ClipboardCheck, route: '/student/attendance', primary: true },
    { label: 'Assignments', icon: FileStack, route: '/student/assignments' },
    { label: 'Marks', icon: GraduationCap, route: '/student/marks' },
    { label: 'Routine', icon: CalendarDays, route: '/student/routine' },
    { label: 'Notices', icon: Bell, route: '/student/notices' },
    { label: 'Materials', icon: LibraryBig, route: '/student/materials' },
    { label: 'Subjects', icon: BookOpen, route: '/student/subjects' },
    { label: 'Tickets', icon: Ticket, route: '/student/tickets' },
    { label: 'ID Card', icon: CreditCard, route: '/student/id-card' },
    { label: 'Logout', icon: LogOut, action: logout }
  ]

  return (
    <Screen>
      <PageHeader
        eyebrow="Home"
        title="Simple student home"
        subtitle="Open what you need from one place."
      />
      {loading ? <LoadingSpinner /> : null}
      <RoleOverview user={user} stats={stats} />

      <AppCard style={[styles.scanCard, { backgroundColor: palette.primary, borderColor: palette.primary }]}>
        <Text style={[styles.scanLabel, { color: palette.white }]}>Attendance</Text>
        <Text style={[styles.scanTitle, { color: palette.white }]}>Tap once to scan your QR code</Text>
        <Pressable style={[styles.scanButton, { backgroundColor: palette.white }]} onPress={() => router.push('/student/attendance')}>
          <Text style={[styles.scanButtonText, { color: palette.primary }]}>Open scanner</Text>
        </Pressable>
      </AppCard>

      <View style={styles.grid}>
        {shortcuts.map(({ label, icon: Icon, route, action, primary }) => (
          <Pressable
            key={label}
            style={[
              styles.shortcut,
              {
                backgroundColor: primary ? palette.surfaceStrong : palette.surface,
                borderColor: primary ? palette.surfaceStrong : palette.border
              }
            ]}
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

      <View style={styles.summaryRow}>
        <AppCard style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: palette.primary }]}>{attendanceData.length}</Text>
          <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Attendance</Text>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: palette.warning }]}>{assignmentsData.length}</Text>
          <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Assignments</Text>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: palette.success }]}>{marksData.length}</Text>
          <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Marks</Text>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: palette.accent }]}>{noticesData.length}</Text>
          <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Notices</Text>
        </AppCard>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scanCard: {
    gap: 10
  },
  scanLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1
  },
  scanTitle: {
    fontSize: 22,
    fontWeight: '800'
  },
  scanButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '800'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  shortcut: {
    width: '31%',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 10
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shortcutText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  summaryCard: {
    width: '48%',
    gap: 6
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800'
  },
  summaryLabel: {
    fontSize: 13
  }
})

export default StudentDashboardScreen
