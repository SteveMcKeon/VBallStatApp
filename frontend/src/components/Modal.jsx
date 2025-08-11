import React from 'react';

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center backdrop-blur-md bg-black/10">
      <div className="bg-white rounded-xl shadow-xl p-6 relative w-full max-w-lg">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded-md hover:bg-gray-200 transition-colors w-8 h-8 flex items-center justify-center"
        >
          <span className="text-gray-500 hover:text-black">✕</span>
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
