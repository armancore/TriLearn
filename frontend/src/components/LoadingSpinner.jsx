const LoadingSpinner = ({ text = 'Loading...' }) => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
    <p className="text-gray-500">{text}</p>
  </div>
)

export default LoadingSpinner
