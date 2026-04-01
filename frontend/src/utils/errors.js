export const getFriendlyErrorMessage = (error, fallbackMessage = 'Something went wrong. Please try again.') => {
  if (!error?.response) {
    return 'Network error. Please check your internet connection and try again.'
  }

  const { status, data } = error.response
  const fieldErrors = data?.errors?.fieldErrors

  if (fieldErrors) {
    const firstFieldMessage = Object.values(fieldErrors).flat().find(Boolean)
    if (firstFieldMessage) {
      return firstFieldMessage
    }
  }

  if (status === 400) {
    return data?.message || fallbackMessage
  }

  if (status === 401) {
    return data?.message || 'Your session has expired. Please sign in again.'
  }

  if (status === 403) {
    return data?.message || 'You do not have permission to do that.'
  }

  if (status === 404) {
    return data?.message || 'The requested resource was not found.'
  }

  if (status === 429) {
    return data?.message || 'Too many requests. Please wait a moment and try again.'
  }

  if (status >= 500) {
    return 'Something went wrong on our side. Please try again in a moment.'
  }

  return data?.message || error?.message || fallbackMessage
}
