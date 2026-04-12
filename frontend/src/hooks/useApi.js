import { useCallback, useEffect, useRef, useState } from 'react'
import { getFriendlyErrorMessage } from '../utils/errors'
import { isRequestCanceled } from '../utils/http'

const useApi = ({ initialData = null, initialLoading = false } = {}) => {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Set())

  useEffect(() => () => {
    mountedRef.current = false
    controllersRef.current.forEach((controller) => controller.abort())
    controllersRef.current.clear()
  }, [])

  const execute = useCallback(async (request, options = {}) => {
    const {
      fallbackMessage = 'Something went wrong',
      clearError = true,
      onSuccess,
      onError,
      transform
    } = options

    if (mountedRef.current) {
      setLoading(true)
      if (clearError) {
        setError('')
      }
    }

    const controller = new AbortController()
    controllersRef.current.add(controller)

    try {
      const response = await request(controller.signal)
      const nextData = transform ? transform(response) : response?.data
      if (!mountedRef.current) {
        return response
      }

      setData(nextData)

      if (onSuccess) {
        onSuccess(nextData, response)
      }

      return response
    } catch (requestError) {
      if (isRequestCanceled(requestError)) {
        return null
      }

      const message = getFriendlyErrorMessage(requestError, fallbackMessage)
      if (mountedRef.current) {
        setError(message)
      }

      if (onError) {
        onError(requestError, message)
      }

      throw requestError
    } finally {
      controllersRef.current.delete(controller)
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  return {
    data,
    setData,
    loading,
    error,
    setError,
    execute
  }
}

export default useApi
