import { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { isRequestCanceled } from '../utils/http'
import logger from '../utils/logger'

const useRoutines = ({ roleLabel = 'user' } = {}) => {
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchRoutines = useCallback(async (signal) => {
    try {
      setError('')
      const res = await api.get('/routines', { signal })
      setRoutines(res.data.routines)
    } catch (requestError) {
      if (isRequestCanceled(requestError)) return
      logger.error(`Failed to load ${roleLabel} routine`, requestError)
      setError(requestError.response?.data?.message || 'Unable to load your routine right now.')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [roleLabel])

  useEffect(() => {
    const controller = new AbortController()
    void fetchRoutines(controller.signal)
    return () => controller.abort()
  }, [fetchRoutines])

  return { routines, loading, error }
}

export default useRoutines
