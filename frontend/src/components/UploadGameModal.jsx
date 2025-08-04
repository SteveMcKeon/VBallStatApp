import React, { useState, useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import FloatingLabelInput from './FloatingLabelInput';
import Modal from './Modal';
import Toast from './Toast'; 
import authorizedFetch from '../utils/authorizedFetch';
import TooltipPortal from '../utils/tooltipPortal';

const UploadGameModal = ({ isOpen, onBeforeOpen, onClose, teamName, onUpload, incompleteUploadData, userId }) => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autofillDate, setAutofillDate] = useState(false);
  const [autofillPlayers, setAutofillPlayers] = useState(false);
  const uploadRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);  
  const [uploadStatus, setUploadStatus] = useState('');
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const progressRef = useRef(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [toastDuration, setToastDuration] = useState('error');
  const [showToast, setShowToast] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const setToast = (message, type = 'error', duration) => {
    setToastMessage(message);
    setToastType(type);
    setToastDuration(duration);
    setShowToast(true);
  };  
  const [date, setDate] = useState('');
  const [players, setPlayers] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const dragCounter = useRef(0);

  useEffect(() => { 
    if (incompleteUploadData && !videoFile) {
    setToast(
      <>
        Please select the video file to resume upload:<br />
        <strong>{incompleteUploadData.filename}</strong>
      </>,
      'neutral',
      10000
    );
    }
  }, [incompleteUploadData, videoFile]);

  useEffect(() => {
    if (incompleteUploadData) {
      if (incompleteUploadData.date) {
        setDate(incompleteUploadData.date);
        setAutofillDate(true);
      }
      if (incompleteUploadData.players) {
        setPlayers(incompleteUploadData.players);
        setAutofillPlayers(true);
      }
    }
  }, [incompleteUploadData]);
  
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

  const handlePauseResume = () => {
    if (!uploadRef.current) return;

    if (isPaused) {
      uploadRef.current.start();
      setIsPaused(false);
    } else {
      uploadRef.current.abort();
      setIsPaused(true);
    }
  };

  const handleSubmit = async () => {
    const customFingerprint = async (file, options) => {
      if (file instanceof Blob) {
        const metadata = options.metadata || {};

        const extraFingerprintData = [
          metadata.date || '',
          metadata.players || '',
          metadata.team_name || '',
          metadata.user_id || ''
        ].join('-');

        return [
          'tus-br',
          file.name,
          file.type,
          file.size,
          file.lastModified,
          options.endpoint,
          extraFingerprintData
        ].join('-');
      }

      return null;
    };
    
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
    setIsPaused(false);
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
        team_name: teamName,
        user_id: userId
      },
      fingerprint: customFingerprint,
      removeFingerprintOnSuccess: true,
      onError: (error) => {
        console.error('Upload failed:', error);
        setIsUploading(false);
        setToast('Upload failed');
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);
        setUploadProgress(percentage);
        if (upload.url && !uploadRef.current?.url) {
          uploadRef.current.url = upload.url;
        }        
      },
      onSuccess: async () => {
        setIsUploading(false);
        setUploadStatus('success');
        setToast('Game uploaded successfully!', 'success');
      }
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });

    uploadRef.current = upload;
  };

  const cancelUpload = async () => {
    if (uploadRef.current) {
      const uploadUrl = uploadRef.current.url;
      if (uploadUrl) {
        const uploadId = uploadUrl.split('/').pop();
        try {
          const res = await authorizedFetch(`/api/delete-upload/${uploadId}`, {
            method: 'DELETE'
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'No response body' }));
            console.error('Failed to delete upload on server:', errorData.message || errorData);
          } else {
            const successData = await res.json().catch(() => ({}));
          }
        } catch (err) {
          console.error('Error deleting upload:', err);
        }
      }
    }
    uploadRef.current.abort();
    setUploadStatus('cancelled');
    setIsUploading(false);
  };

  useEffect(() => {
    if (uploadStatus === 'success' || uploadStatus === 'error' || uploadStatus === 'cancelled') {
      const timeout = setTimeout(() => {
        setUploadStatus('');
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
          onChange={(e) => {
            setDate(e.target.value);
            setAutofillDate(false);
          }}
          className={autofillDate ? 'bg-blue-100' : 'bg-white'}
        />
        <FloatingLabelInput
          label="Players (comma-separated)"
          id="players"
          name="players"
          value={players}
          onChange={(e) => {
            setPlayers(e.target.value);
            setAutofillPlayers(false);
          }}
          className={autofillPlayers ? 'bg-blue-100' : 'bg-white'}
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
        </div>
      </Modal>
      <Toast
        message={toastMessage}
        show={showToast}
        duration={toastDuration}
        onClose={() => setShowToast(false)}
        type={toastType}
      />
      {(isUploading || uploadStatus) && (
        <div className="fixed top-0 right-4 transform h-14 flex items-center z-50">
          <div className="flex items-center px-4 py-2 bg-white shadow-xl rounded-xl border border-gray-200 pointer-events-auto w-94">
            <div
              className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden relative"
              ref={progressRef}
              onMouseEnter={() => setIsProgressHovering(true)}
              onMouseLeave={() => setIsProgressHovering(false)}
            >
              <div
                className={`
                  h-full transition-all duration-300 ease-out
                  ${uploadStatus === 'success' ? 'bg-green-500' :
                    (uploadStatus === 'error' || uploadStatus === 'cancelled') ? 'bg-red-500' :
                    'bg-gradient-to-r from-blue-500 to-blue-600'
                  }
                `}
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="flex-grow flex justify-end items-center ml-3">
              <span className="text-sm font-medium text-gray-700">
                {uploadStatus === 'success' && 'Done'}
                {uploadStatus === 'error' && 'Failed'}
                {uploadStatus === 'cancelled' && 'Cancelled'}
                {isUploading && `${isPaused ? 'Paused' : 'Uploading'}... ${uploadProgress}%`}
              </span>
              {isUploading && (
                <>
                  <button className="ml-1 w-6 h-6 cursor-pointer rounded-md hover:bg-gray-100" onClick={handlePauseResume}>
                    {isPaused ? (
                      <svg viewBox="0 0 36 36" width="100%" height="100%" fill="black">
                        <path d="M 12,10 L 25,18 L 12,26 Z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 36 36" width="100%" height="100%" fill="black">
                        <path d="M 12,10 L 16,10 L 16,26 L 12,26 Z M 20,10 L 24,10 L 24,26 L 20,26 Z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={cancelUpload}
                    className="w-6 h-6 flex items-center justify-center rounded-md 
                              text-gray-500 
                              hover:bg-red-100 transition cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {isProgressHovering && videoFile && (
        <TooltipPortal>
          <div
            style={{
              position: 'fixed',
              top: progressRef.current?.getBoundingClientRect().bottom + 8,
              left: (progressRef.current?.getBoundingClientRect().left || 0) + (progressRef.current?.offsetWidth / 2 || 0),
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              zIndex: 9999
            }}
          >
            Uploading {videoFile.name}
          </div>
        </TooltipPortal>
      )}      
    </>
  );
};

export default UploadGameModal;
