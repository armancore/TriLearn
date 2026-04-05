import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'

const useUnsavedChangesGuard = (enabled) => {
  let blocker = {
    state: 'unblocked',
    reset: undefined,
    proceed: undefined
  }

  try {
    blocker = useBlocker(enabled)
  } catch {
    // `useBlocker` requires a data router. Fall back to beforeunload-only
    // protection when the app is mounted with a standard router.
  }

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
