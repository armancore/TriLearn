import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from './AuthContext'

const ReferenceDataContext = createContext(null)

export const ReferenceDataProvider = ({ children }) => {
  const { user } = useAuth()
  const [subjects, setSubjects] = useState([])
  const [departments, setDepartments] = useState([])
  const subjectsRef = useRef([])
  const departmentsRef = useRef([])
  const subjectRequestRef = useRef(null)
  const departmentRequestRef = useRef(null)

  useEffect(() => {
    subjectsRef.current = subjects
  }, [subjects])

  useEffect(() => {
    departmentsRef.current = departments
  }, [departments])

  useEffect(() => {
    subjectRequestRef.current = null
    departmentRequestRef.current = null
    subjectsRef.current = []
    departmentsRef.current = []
    setSubjects([])
    setDepartments([])
  }, [user?.id, user?.role])

  const loadSubjects = useCallback(async ({ force = false, signal } = {}) => {
    if (!force && subjectsRef.current.length > 0) {
      return subjectsRef.current
    }

    if (signal?.aborted) {
      return subjectsRef.current
    }

    if (subjectRequestRef.current) {
      return subjectRequestRef.current
    }

    // Keep the shared request independent from any single caller's AbortController.
    // Otherwise one unmount can cancel subject loading for every consumer.
    subjectRequestRef.current = api.get('/subjects', {
      params: { limit: 100 }
    })
      .then((response) => {
        const nextSubjects = response.data.subjects || []
        setSubjects(nextSubjects)
        return nextSubjects
      })
      .finally(() => {
        subjectRequestRef.current = null
      })

    const request = subjectRequestRef.current

    if (!signal) {
      return request
    }

    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        signal.removeEventListener('abort', handleAbort)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', handleAbort, { once: true })

      request.then(
        (value) => {
          signal.removeEventListener('abort', handleAbort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', handleAbort)
          reject(error)
        }
      )
    })
  }, [])

  const loadDepartments = useCallback(async ({ force = false, signal } = {}) => {
    if (!force && departmentsRef.current.length > 0) {
      return departmentsRef.current
    }

    if (signal?.aborted) {
      return departmentsRef.current
    }

    if (departmentRequestRef.current) {
      return departmentRequestRef.current
    }

    // Keep the shared request independent from any single caller's AbortController.
    // Otherwise one unmount can cancel department loading for every consumer.
    departmentRequestRef.current = api.get('/departments')
      .then((response) => {
        const nextDepartments = response.data.departments || []
        setDepartments(nextDepartments)
        return nextDepartments
      })
      .finally(() => {
        departmentRequestRef.current = null
      })

    const request = departmentRequestRef.current

    if (!signal) {
      return request
    }

    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        signal.removeEventListener('abort', handleAbort)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', handleAbort, { once: true })

      request.then(
        (value) => {
          signal.removeEventListener('abort', handleAbort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', handleAbort)
          reject(error)
        }
      )
    })
  }, [])

  const value = useMemo(() => ({
    subjects,
    departments,
    loadSubjects,
    loadDepartments
  }), [departments, loadDepartments, loadSubjects, subjects])

  return (
    <ReferenceDataContext.Provider value={value}>
      {children}
    </ReferenceDataContext.Provider>
  )
}

export const useReferenceData = () => {
  const context = useContext(ReferenceDataContext)

  if (!context) {
    throw new Error('useReferenceData must be used within a ReferenceDataProvider')
  }

  return context
}
