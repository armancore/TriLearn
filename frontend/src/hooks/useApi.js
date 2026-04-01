import { useState } from 'react'
import { getFriendlyErrorMessage } from '../utils/errors'

const useApi = ({ initialData = null, initialLoading = false } = {}) => {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState('')

  const execute = async (request, options = {}) => {
    const {
      fallbackMessage = 'Something went wrong',
      clearError = true,
      onSuccess,
      onError,
      transform
    } = options

    setLoading(true)
    if (clearError) {
      setError('')
    }

    try {
      const response = await request()
      const nextData = transform ? transform(response) : response?.data
      setData(nextData)

      if (onSuccess) {
        onSuccess(nextData, response)
      }

      return response
    } catch (requestError) {
      const message = getFriendlyErrorMessage(requestError, fallbackMessage)
      setError(message)

      if (onError) {
        onError(requestError, message)
      }

      throw requestError
    } finally {
      setLoading(false)
    }
  }

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
