import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { BookOpen, FileStack, GraduationCap, LibraryBig } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const learningItems = [
  { label: 'Assignments', subtitle: 'See tasks and submissions', icon: FileStack, route: '/student/assignments' },
  { label: 'Marks', subtitle: 'Check your results', icon: GraduationCap, route: '/student/marks' },
  { label: 'Materials', subtitle: 'Open study files', icon: LibraryBig, route: '/student/materials' },
  { label: 'Subjects', subtitle: 'View your subjects', icon: BookOpen, route: '/student/subjects' }
]

const LearningScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader
        eyebrow="Learning"
        title="Everything academic in one place"
        subtitle="Open assignments, marks, materials, and subjects from here."
      />

      <View style={styles.grid}>
        {learningItems.map(({ label, subtitle, icon: Icon, route }) => (
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
        <Text style={[styles.tipTitle, { color: palette.text }]}>Quick tip</Text>
        <Text style={[styles.tipText, { color: palette.textMuted }]}>
          Use Home for all shortcuts and scanning. Use Learning when you only want academic tools.
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

export default LearningScreen
