import React, { useState, useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import FloatingLabelInput from './FloatingLabelInput';
import Modal from './Modal';
import Toast from './Toast'; 

const UploadGameModal = ({ isOpen, onBeforeOpen, onClose, teamName, onUpload }) => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);  
  const [uploadStatus, setUploadStatus] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [showToast, setShowToast] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const setToast = (message, type = 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };  
  const [date, setDate] = useState('');
  const [players, setPlayers] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const dragCounter = useRef(0);
  
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type === 'video/mp4') {
        setVideoFile(file);
      } else {
        setToast('Only MP4 video files are supported');
        e.target.value = '';
      }
    }
  };

  const handleSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setToast('Date format should be YYYY-MM-DD');
      return;
    }
    if (!players.trim()) {
      setToast('Please enter players (comma-separated)');
      return;
    }    
    if (!videoFile) {
      setToast('Please select a video file');
      return;
    }
    if (videoFile.type !== 'video/mp4') {
      setToast('Only MP4 video files are supported');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    onClose();

    const upload = new tus.Upload(videoFile, {
      endpoint: '/api/upload-game',
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        filename: videoFile.name,
        filetype: videoFile.type,
        date,
        players,
        team_name: teamName
      },
      onError: (error) => {
        console.error('Upload failed:', error);
        setIsUploading(false);
        setToast('Upload failed');
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);
        setUploadProgress(percentage);
      },
      onSuccess: () => {
        console.log('Upload completed');
        setIsUploading(false);
        setUploadStatus('success');
        setToast('Game uploaded successfully!', 'success');
      }
    });

    upload.start();

    xhrRef.current = { abort: () => upload.abort() }; // For cancelUpload
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      setUploadStatus('cancelled');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
  
  useEffect(() => {
    if (uploadStatus === 'success' || uploadStatus === 'error' || uploadStatus === 'cancelled') {
      const timeout = setTimeout(() => {
        setUploadStatus('');
        setUploadProgress(0);
      }, 5000); // Hide after 5 seconds
      return () => clearTimeout(timeout);
    }
  }, [uploadStatus]);

  useEffect(() => {
    if (isOpen && onBeforeOpen) {
      onBeforeOpen();
    }
  }, [isOpen, onBeforeOpen]);

  useEffect(() => {
    const stopKeyPropagation = (e) => {
      if (isOpen) {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', stopKeyPropagation, true);
    return () => {
      window.removeEventListener('keydown', stopKeyPropagation, true);
    };
  }, [isOpen]);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Upload New Game</h2>
          <p className="text-sm text-gray-600">
            For best results, video uploads should be at least 1080p <br /> (1920 x 1080 pixels) and must be in MP4 format.
          </p>
          <p className="text-sm text-gray-600">
            <br />The game will be assigned to your currently selected team.
          </p>          
        </div>
        <FloatingLabelInput
          label="Date (YYYY-MM-DD)"
          id="date"
          name="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <FloatingLabelInput
          label="Players (comma-separated)"
          id="players"
          name="players"
          value={players}
          onChange={(e) => setPlayers(e.target.value)}
        />
        {/* Drag & Drop*/}
        <div
          className={`mt-6 border-2 border-dashed border-gray-300 rounded-lg py-12 px-6 text-center relative transition-all ${
            isDragging ? 'border-blue-500 ring-2 ring-blue-300' : ''
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounter.current++;
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragCounter.current--;
            if (dragCounter.current === 0) {
              setIsDragging(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            // No need to setIsDragging here
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCounter.current = 0;
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'video/mp4') {
              setVideoFile(file);
            } else {
              setToast('Only MP4 video files are supported');
            }
          }}
        >
          <p className="text-lg font-semibold mb-1">Drag and drop a video file to upload</p>
          <p className="text-sm text-gray-500 mb-4">Your video will take some time to process before it's available.</p>
          <input
            type="file"
            accept="video/mp4"
            onChange={handleFileSelect}
            className="hidden"
            id="fileUpload"
          />
          <label
            htmlFor="fileUpload"
            className="inline-block px-6 py-2 bg-white border border-gray-300 rounded-md font-semibold text-sm cursor-pointer hover:bg-gray-100"
          >
            Select file
          </label>
          <div className="mt-2 h-5 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-700">
            {videoFile ? videoFile.name : '\u00A0'}
          </div>
        </div>
        {/* Bottom buttons */}
        <div className="mt-6 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800">Upload Game</button>
          {/*<button
            onClick={() => setToast('Upload functionality not fully implemented yet')}
            className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md cursor-pointer" >
            Upload Game
          </button> */}
        </div>
      </Modal>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        type={toastType}
      />
      {(isUploading || uploadStatus) && (
        <div className="fixed top-0 right-4 transform h-14 flex items-center z-50">
          <div className="flex items-center gap-3 px-4 py-2 bg-white shadow-xl rounded-xl border border-gray-200 pointer-events-auto">
            <div className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`
                  h-full transition-all duration-300 ease-out
                  ${uploadStatus === 'success' ? 'bg-green-500' :
                    uploadStatus === 'error' ? 'bg-red-500' :
                    'bg-gradient-to-r from-blue-500 to-blue-600'
                  }
                `}
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="w-32 text-right text-sm font-medium text-gray-700">
              {uploadStatus === 'success' && 'Done'}
              {uploadStatus === 'error' && 'Failed'}
              {uploadStatus === 'cancelled' && 'Cancelled'}
              {isUploading && `Uploading... ${uploadProgress}%`}
            </div>
            {isUploading && (
              <button
                onClick={cancelUpload}
                className="ml-2 text-gray-500 hover:text-red-500 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default UploadGameModal;
