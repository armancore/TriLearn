const sanitizeAxiosError = (error) => ({
  message: error?.message,
  status: error?.response?.status,
  url: error?.config?.url,
  method: error?.config?.method
})

const normalizeLogArg = (arg) => {
  if (arg && typeof arg === 'object' && (arg.isAxiosError || arg.config || arg.response)) {
    return sanitizeAxiosError(arg)
  }

  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message }
  }

  return arg
}

const logger = {
  error: (...args) => {
    const normalizedArgs = args.length === 0
      ? ['Unexpected frontend error']
      : args.map(normalizeLogArg)
    console.error(...normalizedArgs)
  },
  info: (...args) => {
    if (import.meta.env.DEV) {
      console.info(...args)
    }
  }
}

export default logger
