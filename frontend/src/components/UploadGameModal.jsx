import React, { useState, useEffect, useRef } from 'react';
import FloatingLabelInput from './FloatingLabelInput';
import Modal from './Modal';
import Toast from './Toast'; 

const UploadGameModal = ({ isOpen, onBeforeOpen, onClose, teamName }) => {
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
    
    if (!videoFile) {
      setToast('Please select a video file');
      return;
    }
    if (videoFile.type !== 'video/mp4') {
      setToast('Only MP4 video files are supported');
      return;
    }

    const formData = new FormData();
    formData.append('date', date);
    formData.append('players', players);
    formData.append('video', videoFile);
    formData.append('team_name', teamName);

    const res = await fetch('/api/upload-game', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.success) {
      setToast('Game uploaded successfully!', 'success');
      onClose();
    } else {
      setToast(result.message || 'Upload failed');
    }
  };

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
            {/*<button onClick={handleSubmit} className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800">Upload Game</button>*/}
          <button
            onClick={() => setToast('Upload functionality not fully implemented yet')}
            className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md cursor-pointer" >
            Upload Game
          </button> 
        </div>
      </Modal>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        type={toastType}
      />
    </>
  );
};

export default UploadGameModal;
