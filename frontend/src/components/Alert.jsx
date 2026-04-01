const styles = {
  success: 'bg-green-50 text-green-600',
  error: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-600'
}

const Alert = ({ type, message }) => {
  if (!message) return null

  return (
    <div className={`${styles[type] || styles.info} px-4 py-3 rounded-lg mb-4 text-sm`}>
      {message}
    </div>
  )
}

export default Alert
