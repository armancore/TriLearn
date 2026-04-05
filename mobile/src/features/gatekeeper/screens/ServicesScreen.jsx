import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ScanFace } from 'lucide-react-native'
import AppCard from '../../../components/common/AppCard'
import PageHeader from '../../../components/common/PageHeader'
import Screen from '../../../components/common/Screen'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'

const ServicesScreen = () => {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]

  return (
    <Screen>
      <PageHeader eyebrow="Services" title="Gate services" subtitle="Keep the scanner easy to reach while using a cleaner bottom navigation." />
      <Pressable style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={() => router.push('/gatekeeper/scanner')}>
        <View style={[styles.iconWrap, { backgroundColor: palette.primarySoft }]}>
          <ScanFace color={palette.primary} size={24} />
        </View>
        <Text style={[styles.title, { color: palette.text }]}>Student ID scanner</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Open the gate attendance scanner.</Text>
      </Pressable>
      <AppCard>
        <Text style={[styles.tipTitle, { color: palette.text }]}>Quickest route</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Use Home or Scanner for the main action. Services keeps the app structure consistent across every role.</Text>
      </AppCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  tipTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 }
})

export default ServicesScreen
