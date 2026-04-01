const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close modal">
          x
        </button>
      </div>
      {children}
    </div>
  </div>
)

export default Modal
