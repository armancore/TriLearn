import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Building2, Layers3, Users } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const items = [
  { label: 'Users', subtitle: 'Manage institution accounts', icon: Users, route: '/admin/users' },
  { label: 'Departments', subtitle: 'Maintain departments', icon: Building2, route: '/admin/departments' },
  { label: 'Subjects', subtitle: 'Manage subjects', icon: Layers3, route: '/admin/subjects' }
]

const ManagementScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader eyebrow="Management" title="Administration tools" subtitle="Open the core institution management sections from one clean place." />
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
        <Text style={[styles.tipTitle, { color: palette.text }]}>Keep it focused</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Home gives the fastest shortcuts. Management is for institution setup. Services covers notices and routine.</Text>
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

export default ManagementScreen
