import { useEffect } from 'react';

const Toast = ({ message, show, duration = 5000, onClose, type = 'success' }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!show) return null;

  const typeStyles = {
    success: 'border-green-700 bg-green-700',
    error: 'border-red-700 bg-red-700',
    neutral: 'border-yellow-600 bg-yellow-500 text-black'
  };

  const iconPath = {
    success: (
      <>
        <path d="M12.498 6.90887C12.7094 6.60867 13.1245 6.53642 13.4248 6.74774C13.7249 6.95913 13.7971 7.37424 13.5859 7.6745L9.62695 13.2995C9.51084 13.4644 9.32628 13.5681 9.125 13.5807C8.94863 13.5918 8.77583 13.5319 8.64453 13.4167L8.59082 13.364L6.50781 11.072L6.42773 10.9645C6.26956 10.6986 6.31486 10.3488 6.55273 10.1325C6.79045 9.91663 7.14198 9.9053 7.3916 10.0876L7.49219 10.1774L9.0166 11.8542L12.498 6.90887Z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.3333 2.08496C14.7046 2.08496 18.2483 5.62867 18.2483 10C18.2483 14.3713 14.7046 17.915 10.3333 17.915C5.96192 17.915 2.41821 14.3713 2.41821 10C2.41821 5.62867 5.96192 2.08496 10.3333 2.08496ZM10.3333 3.41504C6.69646 3.41504 3.74829 6.3632 3.74829 10C3.74829 13.6368 6.69646 16.585 10.3333 16.585C13.97 16.585 16.9182 13.6368 16.9182 10C16.9182 6.3632 13.97 3.41504 10.3333 3.41504Z" />
      </>
    ),
    error: (
      <>
        <path fillRule="evenodd" clipRule="evenodd" d="M10.3333 2.08496C14.7046 2.08496 18.2483 5.62867 18.2483 10C18.2483 14.3713 14.7046 17.915 10.3333 17.915C5.96192 17.915 2.41821 14.3713 2.41821 10C2.41821 5.62867 5.96192 2.08496 10.3333 2.08496ZM10.3333 3.41504C6.69646 3.41504 3.74829 6.3632 3.74829 10C3.74829 13.6368 6.69646 16.585 10.3333 16.585C13.97 16.585 16.9182 13.6368 16.9182 10C16.9182 6.3632 13.97 3.41504 10.3333 3.41504Z" />
        <path d="M7.75 7.75L12.9167 12.9167M7.75 12.9167L12.9167 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    neutral: (
      <>
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="10" y1="6" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14" r="1" fill="currentColor" />
      </>
    )    
  };

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex justify-center pointer-events-none">
      <div className="w-full max-w-md p-1 text-center md:w-auto md:text-justify">
        <div className={`px-3 py-2 rounded-lg inline-flex flex-row border text-white gap-2 pointer-events-auto ${typeStyles[type]}`} role="alert">
          <div className="mt-1 shrink-0 grow-0">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon-sm">
              {iconPath[type]}
            </svg>
          </div>
          <div className="flex-1 justify-center gap-2">
            <div className="text-start whitespace-pre-wrap">{message}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;
