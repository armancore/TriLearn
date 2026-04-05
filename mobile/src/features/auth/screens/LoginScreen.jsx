import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AppButton from '../../../components/common/AppButton'
import AppCard from '../../../components/common/AppCard'
import AppInput from '../../../components/common/AppInput'
import ErrorMessage from '../../../components/common/ErrorMessage'
import Screen from '../../../components/common/Screen'
import { useAuth } from '../../../context/AuthContext'
import { useTheme } from '../../../context/ThemeContext'
import colors from '../../../constants/colors'
import { getFriendlyErrorMessage } from '../../../utils/errors'

const LoginScreen = () => {
  const { login } = useAuth()
  const { resolvedTheme } = useTheme()
  const palette = colors[resolvedTheme]
  const router = useRouter()
  const [values, setValues] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!values.email.trim() || !values.password) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await login(values)
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError, 'Unable to sign in right now.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: palette.primary }]}>TriLearn</Text>
          <Text style={[styles.heading, { color: palette.text }]}>Sign in</Text>
          <Text style={[styles.subheading, { color: palette.textMuted }]}>
            Use your college account to continue.
          </Text>
        </View>

        <AppCard style={styles.card}>
          <AppInput
            label="Email"
            value={values.email}
            onChangeText={(email) => setValues((current) => ({ ...current, email }))}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@college.edu"
          />
          <AppInput
            label="Password"
            value={values.password}
            onChangeText={(password) => setValues((current) => ({ ...current, password }))}
            secureTextEntry
            placeholder="Enter password"
          />
          <ErrorMessage message={error} />
          <AppButton title="Sign In" onPress={handleSubmit} loading={loading} />
          <Pressable onPress={() => router.push('/auth/forgot-password')}>
            <Text style={[styles.link, { color: palette.primary }]}>Forgot password?</Text>
          </Pressable>
        </AppCard>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 18,
    paddingTop: 8,
    paddingBottom: 24
  },
  header: {
    gap: 6
  },
  brand: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4
  },
  heading: {
    fontSize: 30,
    fontWeight: '800'
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    gap: 16
  },
  link: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700'
  }
})

export default LoginScreen
