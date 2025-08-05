import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useLayoutEffect  } from 'react';
import * as tus from 'tus-js-client';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FloatingLabelInput from './FloatingLabelInput';
import Modal from './Modal';
import Toast from './Toast'; 
import authorizedFetch from '../utils/authorizedFetch';
import TooltipPortal from '../utils/tooltipPortal';

const SortableItem = ({ upload, id, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}  
      className="flex justify-between items-center px-2 py-1 mb-1 bg-white rounded border border-gray-200 shadow-sm cursor-grab"
    >
      <div className="flex items-center min-w-0">
        <span className="text-gray-400 text-lg mr-2 flex-shrink-0">≡</span>
        <span className="truncate text-sm">{upload.file.name}</span>
      </div>
      <div className="flex items-center flex-shrink-0 ml-2 space-x-2">
        <span className="text-gray-500 text-xs">Set {upload.setNumber}</span>
        <button
          onClick={() => onRemove(upload.id)}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();  
          }}
          className="w-6 h-6 flex items-center justify-center rounded-md 
                    text-gray-500 hover:bg-red-100 transition cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const UploadOrderList = ({ uploads, setUploads, onRemove }) => {
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = uploads.findIndex(u => u.id === active.id);
      const newIndex = uploads.findIndex(u => u.id === over.id);

      const newUploads = arrayMove(uploads, oldIndex, newIndex).map((upload, idx) => ({
        ...upload,
        setNumber: idx + 1
      }));

      setUploads(newUploads);
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-1 mt-2">
        <SortableContext items={uploads.map(u => u.id)} strategy={verticalListSortingStrategy}>
          {uploads.map((upload) => (
            <SortableItem key={upload.id} id={upload.id} upload={upload} onRemove={onRemove} />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
};

const UploadGameModal = forwardRef(({ isOpen, onBeforeOpen, onClose, teamName, onUpload, userId, resumeSilently }, ref) => {
  const [gameGroupId, setGameGroupId] = useState(() => crypto.randomUUID());
  const [uploads, setUploads] = useState([]);
  const [autofillDate, setAutofillDate] = useState(false);
  const [autofillPlayers, setAutofillPlayers] = useState(false);
  const uploadRef = useRef(null);
  const [resumeFileHandle, setResumeFileHandle] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);  
  const [isProgressHovering, setIsProgressHovering] = useState(false);
  const progressRefs = useRef([]);
  useEffect(() => {
    const refs = { ...progressRefs.current };
    uploads.forEach(upload => {
      if (!refs[upload.id]) {
        refs[upload.id] = React.createRef();
      }
    });
    progressRefs.current = refs;
  }, [uploads]);  
  const handleRemoveUpload = (id) => {
    setUploads(prevUploads =>
      prevUploads
        .filter(upload => upload.id !== id)
        .map((upload, idx) => ({ ...upload, setNumber: idx + 1 }))
    );
  };  
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
  const dragCounter = useRef(0);
  const [incompleteUploadData, setIncompleteUploadData] = useState(null);
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
  const scanIncompleteUploads = () => {
    const incompleteUploads = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tus::')) {
        try {
          const uploadData = JSON.parse(localStorage.getItem(key));
          if (uploadData?.metadata?.user_id === userId) {
            incompleteUploads.push({ key, ...uploadData });
          }
        } catch (e) {
          console.error('Error parsing tus entry:', e);
        }
      }
    }
    return incompleteUploads;
  };

  const loadAllResumableUploads = async () => {
    const incompleteUploads = scanIncompleteUploads();
    const resumableUploads = [];

    for (const upload of incompleteUploads) {
      const fileHandle = await getFileHandleFromIndexedDB(upload.key);
      if (fileHandle) {
        resumableUploads.push({ key: upload.key, uploadData: upload, fileHandle });
      }
    }
    return resumableUploads;
  };
  
  const getNextSetNumber = (uploads) => {
    const existingNumbers = uploads.map(u => u.setNumber).filter(Boolean);
    let num = 1;
    while (existingNumbers.includes(num)) {
      num++;
    }
    return num;
  };  
  
  useImperativeHandle(ref, () => ({
    triggerResumeAllUploads: async () => {
      const resumableUploads = await loadAllResumableUploads();
      if (resumableUploads.length === 0) {
        setToast('No resumable uploads found', 'error');
        return;
      }
      for (const { key, uploadData, fileHandle } of resumableUploads) {
        try {
          if (!fileHandle || typeof fileHandle.requestPermission !== 'function') {
            console.error('Invalid file handle structure', fileHandle);
            setToast(`Failed to resume ${uploadData.metadata.filename}`, 'error');
            await removeFileHandleFromIndexedDB(key);
            localStorage.removeItem(key);
            continue;
          }
          const permission = await fileHandle.requestPermission();
          if (permission === 'granted') {
            try {
              const file = await fileHandle.getFile();
              const metadata = uploadData.metadata;
              if (metadata.date) {
                setDate(metadata.date);
                setAutofillDate(true);
              }
              if (metadata.players) {
                setPlayers(metadata.players);
                setAutofillPlayers(true);
              }
              const fingerprint = await customFingerprint(file, {
                endpoint: '/api/upload-game',
                metadata
              });              
              setUploads(prev => [
                ...prev,
                {
                  file,
                  progress: 0,
                  status: 'pending',
                  paused: false,
                  uploadRef: null,
                  fileHandle,
                  id: fingerprint,
                  setNumber: parseInt(uploadData.metadata.setNumber, 10)
                }
              ]);
              setToast(`Resumed upload for ${file.name}`, 'success');
              setTimeout(() => {
                handleSubmit(fingerprint, file, metadata.date, metadata.players, fingerprint);
              }, 0);
            } catch (fileError) {
              console.error('Failed to get file from handle', fileError);
              setToast(`Could not access file ${uploadData.metadata.filename}. Try again later.`, 'error');
            }
          } else {
            setToast(`Permission denied for ${uploadData.metadata.filename}`, 'error');
            await removeFileHandleFromIndexedDB(key);
            localStorage.removeItem(key);
          }
        } catch (err) {
          console.error('Unexpected resume failure', err);
          setToast(`Unexpected failure while resuming ${uploadData.metadata.filename}`, 'error');
        }
      }
    }
  }));

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
  
  const currentFileHandleRef = useRef(null);
  const handleFileSelect = async () => {
    if (uploads.length >= 5) {
      setToast('Maximum of 5 video files allowed', 'error');
      return;
    }    
    if (!window.showOpenFilePicker) {
      setToast('Your browser does not support persistent file access', 'error');
      return;
    }

    try {
      const fileHandles = await window.showOpenFilePicker({
        types: [{ description: 'MP4 Videos', accept: { 'video/mp4': ['.mp4'] } }],
        excludeAcceptAllOption: true,
        multiple: true,
      });
      const newUploads = [];
      let duplicateCount = 0;
      let invalidCount = 0;  
      for (const fileHandle of fileHandles) {
        const file = await fileHandle.getFile();
        if (file.type !== 'video/mp4') {
          invalidCount++;
          continue;
        }
        const metadata = {
          filename: file.name,
          filetype: file.type,
          date,
          players,
          team_name: teamName,
          user_id: userId,
          game_group_id: gameGroupId,
          setNumber: (uploads.length + 1).toString()
        };
        const fingerprint = await customFingerprint(file, { endpoint: '/api/upload-game', metadata });            
        if (uploads.some(u => u.file.name === file.name) || newUploads.some(u => u.file.name === file.name)) {
          duplicateCount++;
          continue;
        }
        newUploads.push({
          file,
          progress: 0,
          status: 'pending',
          paused: false,
          uploadRef: null,
          fileHandle,
          id: fingerprint,
          setNumber: getNextSetNumber([...uploads, ...newUploads])
        });
      }
      if (invalidCount > 0) {
        setToast(`${invalidCount} invalid file(s) skipped (only MP4 allowed)`, 'error');
      }
      if (newUploads.length === 0) {
        if (duplicateCount === 0 && invalidCount > 0) {
          setToast('No valid MP4 files selected', 'error');
        }
        return;
      }
      const remainingSlots = 5 - uploads.length;
      const uploadsToAdd = newUploads.slice(0, remainingSlots);
      setUploads(prev => [...prev, ...uploadsToAdd]);

      if (uploadsToAdd.length < newUploads.length) {
        setToast('Only 5 files allowed. Some were not added.', 'error');
      }
    } catch (err) {
      console.error('File selection cancelled or failed', err);
    }
  };

  function openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('upload-files-db', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('file-handles')) {
          db.createObjectStore('file-handles');
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function saveFileHandleToIndexedDB(fileHandle, key) {
    const db = await openIndexedDB();
    const tx = db.transaction('file-handles', 'readwrite');
    const store = tx.objectStore('file-handles');
    store.put(fileHandle, key);
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }

  async function getFileHandleFromIndexedDB(key) {
    const db = await openIndexedDB();
    const tx = db.transaction('file-handles', 'readonly');
    const store = tx.objectStore('file-handles');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async function removeFileHandleFromIndexedDB(key) {
    const db = await openIndexedDB();
    const tx = db.transaction('file-handles', 'readwrite');
    const store = tx.objectStore('file-handles');
    store.delete(key);
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }

  useEffect(() => {
    const tryLoadFileHandle = async () => {
      const incompleteUploads = scanIncompleteUploads();
      if (incompleteUploads.length === 0) return;
      for (const upload of incompleteUploads) {
        const fileHandle = await getFileHandleFromIndexedDB(upload.key);
        if (fileHandle) {
          setResumeFileHandle(fileHandle);
          break;
        }
      }
    };
    tryLoadFileHandle();
  }, []);

  useEffect(() => {
    if (resumeFileHandle && isOpen) {
      (async () => {
        try {
          const permission = await resumeFileHandle.requestPermission();
          if (permission !== 'granted') {
            setToast('Permission denied. Please re-select the file.', 'error');
            await removeFileHandleFromIndexedDB();
            setResumeFileHandle(null);
            return;
          }
          const file = await resumeFileHandle.getFile();
          let uploadData = null;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tus::')) {
              const data = JSON.parse(localStorage.getItem(key));
              if (data && data.metadata?.filename === file.name && data.metadata?.user_id === userId) {
                uploadData = data;
                break;
              }
            }
          }
          if (!uploadData) {
            setToast('Could not find upload metadata for this file.', 'error');
            await removeFileHandleFromIndexedDB();
            setResumeFileHandle(null);
            return;
          }          
          const metadata = {
            filename: file.name,
            filetype: file.type,
            date,
            players,
            team_name: teamName,
            user_id: userId,
            game_group_id: gameGroupId,
            setNumber: parseInt(uploadData.metadata.setNumber, 10)
          };
          const fingerprint = await customFingerprint(file, { endpoint: '/api/upload-game', metadata });
          const newUpload = {
            file,
            progress: 0,
            status: 'pending',
            paused: false,
            uploadRef: null,
            fileHandle: resumeFileHandle,
            id: fingerprint,
            setNumber: parseInt(uploadData.metadata.setNumber, 10)
          };
          setUploads(prev => [...prev, newUpload]);
          setResumeFileHandle(null);
          onClose();
          setToast('Resumed upload from previous session', 'success');
          setTimeout(() => {
            handleSubmit(newUpload.id);
          }, 0);
        } catch (err) {
          console.error('Failed to resume file handle', err);
          setToast('Failed to resume file handle', 'error');
          await removeFileHandleFromIndexedDB();
          setResumeFileHandle(null);
        }
      })();
    }
  }, [resumeFileHandle, isOpen]);

  const handleResumeUpload = async () => {
    if (!resumeFileHandle) return;

    try {
      const permission = await resumeFileHandle.requestPermission();
      if (permission === 'granted') {
        const file = await resumeFileHandle.getFile();
        setVideoFile(file);
        setResumeFileHandle(null);  // Clear resume state
        if (!resumeSilently) {
          onClose();
        }
        setToast('Resumed upload from previous session', 'success');
        handleSubmit(file);
      } else {
        setToast('Permission denied. Please re-select the file.', 'error');
        await removeFileHandleFromIndexedDB();
        setResumeFileHandle(null);
      }
    } catch (err) {
      console.error('Failed to resume file handle', err);
      setToast('Failed to resume file handle', 'error');
      await removeFileHandleFromIndexedDB();
      setResumeFileHandle(null);
    }
  };

  const togglePauseResume = (uploadId) => {
    const index = uploads.findIndex(u => u.id === uploadId);
    if (index === -1) return;

    const uploadItem = uploads[index];
    const uploadRef = uploadItem.uploadRef;
    if (!uploadRef) return;

    if (uploadItem.paused) {
      uploadRef.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length) {
          uploadRef.resumeFromPreviousUpload(previousUploads[0]);
        }
        uploadRef.start();

        setUploads(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index].paused = false;
            updated[index].status = 'uploading';
          }
          return updated;
        });
      });
    } else {
      uploadRef.abort();
      setUploads(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index].paused = true;
          updated[index].status = 'paused';
        }
        return updated;
      });
    }
  };

  const cancelUpload = async (uploadId) => {
    const uploadIndex = uploads.findIndex(u => u.id === uploadId);
    if (uploadIndex === -1) return;

    const upload = uploads[uploadIndex];
    if (!upload || !upload.uploadRef) return;

    upload.uploadRef.abort();
    const uploadUrl = upload.uploadRef.url;
    if (uploadUrl) {
      const tusUploadId = uploadUrl.split('/').pop();
      try {
        const res = await authorizedFetch(`/api/delete-upload/${tusUploadId}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: 'No response body' }));
          console.error('Failed to delete upload on server:', errorData.message || errorData);
        }
      } catch (err) {
        console.error('Error deleting upload:', err);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tus::')) {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.metadata?.user_id === userId && data.metadata?.filename === upload.file.name){
            localStorage.removeItem(key);
            await removeFileHandleFromIndexedDB(key);
            break;
          }
        }
      }
      setUploads(prev => prev.filter(u => u.id !== uploadId));
    }
  };

const handleSubmit = async (uploadId, fileOverride = null, dateOverride = null, playersOverride = null, tusKeyOverride = null) => {
  const uploadItem = uploads.find(u => u.id === uploadId);
  if (!uploadItem && !fileOverride) {
    setToast('No file selected for upload');
    return;
  }
  const fileToUpload = fileOverride || uploadItem.file;
  const dateToUse = dateOverride || date;
  const playersToUse = playersOverride || players;
  if (!/\d{4}-\d{2}-\d{2}/.test(dateToUse)) {
    setToast('Date format should be YYYY-MM-DD');
    return 'validation-error';
  }
  if (!playersToUse.trim()) {
    setToast('Please enter players (comma-separated)');
    return 'validation-error';
  }

  let fileHandleSaved = false;

  const upload = new tus.Upload(fileToUpload, {
    endpoint: '/api/upload-game',
    retryDelays: [0, 1000, 3000, 5000],
    metadata: {
      filename: fileToUpload.name,
      filetype: fileToUpload.type,
      date: dateToUse,
      players: playersToUse,
      team_name: teamName,
      user_id: userId,
      game_group_id: gameGroupId,
      setNumber: uploadItem?.setNumber?.toString() || '1'
    },
    fingerprint: customFingerprint,
    onError: (error) => {
      console.error('Upload failed:', error);
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'error' } : u));
      setToast('Upload failed');
    },
    onProgress: async (bytesUploaded, bytesTotal) => {
      const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);
      setUploads(prev => prev.map(u => (u.id === uploadId ? { ...u, progress: percentage } : u)));

      if (!fileHandleSaved && uploadItem?.fileHandle) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('tus::')) {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.metadata?.user_id === userId && data.metadata?.filename === fileToUpload.name) {
              await saveFileHandleToIndexedDB(uploadItem.fileHandle, key);
              fileHandleSaved = true;
              break;
            }
          }
        }
      }
    },
    onSuccess: async () => {
      setUploads(prev => prev.map(u => (u.id === uploadId ? { ...u, status: 'success' } : u)));
      setToast('Game uploaded successfully!', 'success');
      setTimeout(() => {
        setUploads(prev => prev.filter(u => u.id !== uploadId));
      }, 5000);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tus::')) {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.metadata?.user_id === userId && data.metadata?.filename === fileToUpload.name) {
            localStorage.removeItem(key);
            await removeFileHandleFromIndexedDB(key);
            break;
          }
        }
      }
    }
  });

  setUploads(prev => prev.map(u => (u.id === uploadId ? { ...u, uploadRef: upload, status: 'uploading' } : u)));

  upload.findPreviousUploads().then((previousUploads) => {
    if (previousUploads.length > 0) {
      upload.resumeFromPreviousUpload(previousUploads[0]);
    }
    upload.start();
  });
};
  
  useEffect(() => {
    if (isOpen) {
      setGameGroupId(crypto.randomUUID()); 
      setUploads([]); 
      if (onBeforeOpen) {
        onBeforeOpen();
      }
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

  useEffect(() => {
    const refs = { ...progressRefs.current };
    uploads.forEach(upload => {
      if (!refs[upload.id]) {
        refs[upload.id] = React.createRef();
      }
    });
    progressRefs.current = refs;
  }, [uploads]);

  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (isProgressHovering) {
      const ref = progressRefs.current[isProgressHovering]?.current;
      if (ref) {
        const rect = ref.getBoundingClientRect();
        setTooltipPosition({
          top: rect.bottom + 8,
          left: rect.left + rect.width / 2
        });
      }
    }
  }, [isProgressHovering, uploads]);

  return (
    <>
    {!resumeSilently && (
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
          className={`mt-6 border-2 border-dashed border-gray-300 rounded-lg px-6 pt-4 pb-4 text-center relative transition-all ${
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
          onDrop={async (e) => {
            e.preventDefault();
            dragCounter.current = 0;
            setIsDragging(false);

            const files = Array.from(e.dataTransfer.files);
            const validFiles = [];
            let invalidCount = 0;

            for (const file of files) {
              if (file.type === 'video/mp4') {
                const metadata = {
                  filename: file.name,
                  filetype: file.type,
                  date,
                  players,
                  team_name: teamName,
                  user_id: userId,
                  game_group_id: gameGroupId,
                  setNumber: (uploads.length + validFiles.length + 1).toString()
                };
                const fingerprint = await customFingerprint(file, { endpoint: '/api/upload-game', metadata });

                validFiles.push({
                  file,
                  progress: 0,
                  status: 'pending',
                  paused: false,
                  uploadRef: null,
                  fileHandle: null,
                  id: fingerprint,
                  setNumber: getNextSetNumber([...uploads, ...validFiles])
                });
              } else {
                invalidCount++;
              }
            }

            if (invalidCount > 0) {
              setToast(`${invalidCount} invalid file(s) skipped (only MP4 allowed)`, 'error');
            }

            const remainingSlots = 5 - uploads.length;
            const uploadsToAdd = validFiles.slice(0, remainingSlots);
            setUploads(prev => [...prev, ...uploadsToAdd]);

            if (uploadsToAdd.length < validFiles.length) {
              setToast('Only 5 files allowed. Some were not added.', 'error');
            }
          }}
        >
        <p className="text-lg font-semibold mb-1">Drag and drop a video file to upload</p>
        <p className="text-sm text-gray-500 mb-4">Your video will take some time to process before it's available.</p>
        <button
          onClick={handleFileSelect}
          className="inline-block px-6 py-2 bg-white border border-gray-300 rounded-md font-semibold text-sm cursor-pointer hover:bg-gray-100"
        >
          Select file(s)
        </button>
        {uploads.filter(upload => upload.status === 'pending').length > 0 && (
          <div className="mt-4 space-y-1">
            <UploadOrderList uploads={uploads.filter(u => u.status === 'pending')} setUploads={setUploads} onRemove={handleRemoveUpload} />
          </div>
        )}
      </div>
      {/* Bottom buttons */}
      <div className="mt-6 flex justify-between">
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100">Cancel</button>
        <button
          onClick={async () => {
            let hasValidationErrors = false;

            for (let index = 0; index < uploads.length; index++) {
              const upload = uploads[index];
              if (upload.status === 'pending') {
                const result = await handleSubmit(upload.id);
                if (result === 'validation-error') {
                  hasValidationErrors = true;
                }
              }
            }

            if (!hasValidationErrors) {
              onClose();
            }
          }}
          className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800"
        >
          Upload Game(s)
        </button>
      </div>       
    </Modal>
  )}
    <Toast
      message={toastMessage}
      show={showToast}
      duration={toastDuration}
      onClose={() => setShowToast(false)}
      type={toastType}
    />
    {uploads.length > 0 && uploads.some(u => u.status !== 'pending') && (
      <div className="fixed top-4 right-4 w-96 bg-white shadow-2xl rounded-xl p-4 z-50">
        {uploads
          .filter(upload => upload.status !== 'pending' && upload.id)
          .map((upload) => (
            <div key={upload.id} className="flex items-center mb-2 last:mb-0 w-full">
              <div className="relative w-40 h-4 bg-gray-200 rounded-full overflow-hidden"
                ref={progressRefs.current[upload.id]}
                onMouseEnter={() => setIsProgressHovering(upload.id)}
                onMouseLeave={() => setIsProgressHovering(null)}
              >              
                <div
                  className={`
                    absolute top-0 left-0 h-full
                    ${upload.status === 'success' ? 'bg-green-500' :
                      (upload.status === 'error' || upload.status === 'cancelled') ? 'bg-red-500' :
                      'bg-gradient-to-r from-blue-500 to-blue-600'
                    }
                  `}
                  style={{ width: `${upload.progress}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-black opacity-55 pointer-events-none">
                  Set {upload.setNumber}
                </div>
              </div>              
              <div className="flex-grow flex justify-end items-center ml-3">
                <span className="text-sm font-medium text-gray-700 mr-2">
                  {upload.status === 'success' && 'Done'}
                  {upload.status === 'error' && 'Failed'}
                  {upload.status === 'cancelled' && 'Cancelled'}
                  {(upload.status === 'uploading' || upload.status === 'paused') && `${upload.paused ? 'Paused' : 'Uploading'}... ${upload.progress}%`}
                </span>
                {(upload.status === 'uploading' || upload.status === 'paused') && (
                  <>
                    <button
                      onClick={() => togglePauseResume(upload.id)}
                      className="w-6 h-6 mr-1 cursor-pointer rounded-md hover:bg-gray-100"
                    >
                      {upload.paused ? (
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
                      onClick={() => cancelUpload(upload.id)}
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
          ))}
      </div>
    )}
      {isProgressHovering && uploads.find(u => u.id === isProgressHovering) && (
        <TooltipPortal>
          <div
            style={{
              position: 'fixed',
              top: tooltipPosition.top,
              left: tooltipPosition.left,
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
            Uploading {uploads.find(u => u.id === isProgressHovering)?.file.name}
          </div>
        </TooltipPortal>
      )}
    </>
  );
});

export default UploadGameModal;