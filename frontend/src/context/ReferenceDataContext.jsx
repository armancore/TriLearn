import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import api from '../utils/api'

const ReferenceDataContext = createContext(null)

export const ReferenceDataProvider = ({ children }) => {
  const [subjects, setSubjects] = useState([])
  const [departments, setDepartments] = useState([])
  const subjectRequestRef = useRef(null)
  const departmentRequestRef = useRef(null)

  const loadSubjects = useCallback(async ({ force = false } = {}) => {
    if (!force && subjects.length > 0) {
      return subjects
    }

    if (!force && subjectRequestRef.current) {
      return subjectRequestRef.current
    }

    subjectRequestRef.current = api.get('/subjects')
      .then((response) => {
        const nextSubjects = response.data.subjects || []
        setSubjects(nextSubjects)
        return nextSubjects
      })
      .finally(() => {
        subjectRequestRef.current = null
      })

    return subjectRequestRef.current
  }, [subjects])

  const loadDepartments = useCallback(async ({ force = false } = {}) => {
    if (!force && departments.length > 0) {
      return departments
    }

    if (!force && departmentRequestRef.current) {
      return departmentRequestRef.current
    }

    departmentRequestRef.current = api.get('/departments')
      .then((response) => {
        const nextDepartments = response.data.departments || []
        setDepartments(nextDepartments)
        return nextDepartments
      })
      .finally(() => {
        departmentRequestRef.current = null
      })

    return departmentRequestRef.current
  }, [departments])

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
