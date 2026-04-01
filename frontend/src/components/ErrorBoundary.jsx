import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI error', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-800">Something went wrong</h1>
            <p className="text-sm text-gray-500 mt-3">
              The app hit an unexpected error. Reload and try again.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
