import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'

const useUnsavedChangesGuard = (enabled) => {
  const blocker = useBlocker(enabled)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setDialogOpen(false)
      return
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [enabled])

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setDialogOpen(true)
    }
  }, [blocker.state])

  const stayOnPage = () => {
    blocker.reset?.()
    setDialogOpen(false)
  }

  const leavePage = () => {
    blocker.proceed?.()
    setDialogOpen(false)
  }

  return {
    dialogOpen,
    leavePage,
    stayOnPage
  }
}

export default useUnsavedChangesGuard
