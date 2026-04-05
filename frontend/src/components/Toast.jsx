import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ToastContext = createContext({ showToast: () => {} })

const toastStyles = {
  success: {
    icon: CheckCircle2,
    card: 'border-primary-200 bg-[var(--color-card-surface)] text-[var(--color-heading)] dark:border-primary-700/40',
    iconWrap: 'bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300',
    progress: 'bg-primary-500'
  },
  error: {
    icon: CircleAlert,
    card: 'border-accent-200 bg-[var(--color-card-surface)] text-[var(--color-heading)] dark:border-accent-700/40',
    iconWrap: 'bg-accent-50 text-accent-600 dark:bg-accent-950/30 dark:text-accent-300',
    progress: 'bg-accent'
  },
  info: {
    icon: Info,
    card: 'border-primary-200 bg-[var(--color-card-surface)] text-[var(--color-heading)] dark:border-primary-700/40',
    iconWrap: 'bg-primary-50 text-primary dark:bg-primary-950/30 dark:text-primary-300',
    progress: 'bg-primary-500'
  }
}

let toastId = 0

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(({ title, description = '', type = 'success', duration = 3000 }) => {
    const id = toastId++
    setToasts((current) => [...current, { id, title, description, type, duration }])
    return id
  }, [])

  const contextValue = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(100%-2rem,24rem)] flex-col gap-3 sm:right-6 sm:top-6">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const Toast = ({ toast, onDismiss }) => {
  const tone = toastStyles[toast.type] || toastStyles.success
  const Icon = tone.icon
  const [progressStarted, setProgressStarted] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss(toast.id)
    }, toast.duration)

    return () => window.clearTimeout(timeoutId)
  }, [onDismiss, toast.duration, toast.id])

  useEffect(() => {
    setProgressStarted(false)
    const frameId = window.requestAnimationFrame(() => {
      setProgressStarted(true)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [toast.duration, toast.id])

  return (
    <div className={`pointer-events-auto relative overflow-hidden rounded-2xl border shadow-2xl dark:shadow-slate-900/50 shadow-slate-900/10 ${tone.card}`}>
      <div className="flex items-start gap-3 px-4 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? (
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{toast.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded-full p-1 text-[var(--color-text-soft)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-muted)]"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-[var(--color-surface-muted)]">
        <div
          className={`h-full ${tone.progress}`}
          style={{
            width: progressStarted ? '0%' : '100%',
            transition: `width ${toast.duration}ms linear`
          }}
        />
      </div>
    </div>
  )
}

export const useToast = () => useContext(ToastContext)

export default Toast
