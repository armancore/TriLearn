import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const REFRESH_TOKEN_KEY = 'trilearn_refresh_token'
const SESSION_HINT_KEY = 'trilearn_session_hint'

const webFallbackStore = new Map()

const canUseSecureStore = () => (
  Platform.OS !== 'web' &&
  typeof SecureStore?.getItemAsync === 'function' &&
  typeof SecureStore?.setItemAsync === 'function' &&
  typeof SecureStore?.deleteItemAsync === 'function'
)

const getItem = async (key) => {
  if (canUseSecureStore()) {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  }

  if (Platform.OS === 'web') {
    return webFallbackStore.get(key) || null
  }

  return null
}

const setItem = async (key, value) => {
  if (canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value)
      return
    } catch {
      return
    }
  }

  if (Platform.OS === 'web') {
    webFallbackStore.set(key, value)
  }
}

const deleteItem = async (key) => {
  if (canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key)
      return
    } catch {
      return
    }
  }

  if (Platform.OS === 'web') {
    webFallbackStore.delete(key)
  }
}

export const saveRefreshToken = async (refreshToken) => {
  if (!refreshToken) {
    await deleteItem(REFRESH_TOKEN_KEY)
    return
  }

  await setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export const getRefreshToken = async () => getItem(REFRESH_TOKEN_KEY)

export const deleteRefreshToken = async () => deleteItem(REFRESH_TOKEN_KEY)

export const setSessionHint = async (value) => {
  if (value) {
    await setItem(SESSION_HINT_KEY, '1')
    return
  }

  await deleteItem(SESSION_HINT_KEY)
}

export const hasSessionHint = async () => Boolean(await getItem(SESSION_HINT_KEY))
