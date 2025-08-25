import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import * as tus from 'tus-js-client';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FloatingLabelInput from './FloatingLabelInput';
import Modal from './Modal';
import Toast from './Toast';
import TooltipPortal from '../utils/tooltipPortal';
const TUS_ENDPOINT = '/api/upload-game';
const SortableItem = ({ upload, id, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between px-2 py-1 mb-1 bg-white rounded border border-gray-200 shadow-sm select-none w-full"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <div className="text-gray-400 text-lg flex-shrink-0" aria-hidden>≡</div>
        <div className="text-sm flex-1 min-w-0 truncate text-left" title={upload.file.name}>{upload.file.name}</div>
        <div className="text-sm text-gray-400">Set {upload.setNumber}</div>
      </div>
      <button
        onClick={() => onRemove(upload.id)}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-100 transition cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseUploadUrl = (url) => {
  // /api/upload-game/<game_group_uuid>_SET-<n>
  const m = /\/api\/upload-game\/([0-9a-f-]+)(?:_SET-(\d+))?$/i.exec(String(url || ''));
  if (!m) return null;
  return { groupId: m[1], setNumber: m[2] ? Number(m[2]) : null };
};
const readTusEntriesFromLocalStorage = () => {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('tus::')) continue;
    try {
      const raw = localStorage.getItem(key);
      const val = JSON.parse(raw);
      entries.push({
        key,
        uploadUrl: val?.uploadUrl,
        metadata: val?.metadata || {},
      });
    } catch { }
  }
  return entries;
};
const getAllGroupEntries = (groupId) => {
  const all = readTusEntriesFromLocalStorage();
  return all.filter(e => parseUploadUrl(e.uploadUrl)?.groupId === groupId);
};
const resolveGameIdsForGroup = async (supabase, groupId, fallbackEntries = []) => {
  const known = new Map();
  for (const e of fallbackEntries) {
    const setNumber = Number(parseUploadUrl(e.uploadUrl)?.setNumber ?? e.metadata?.setNumber);
    const maybe = e.metadata?.game_id;
    if (setNumber && UUID_RE.test(String(maybe))) known.set(setNumber, String(maybe));
  }
  const allSets = fallbackEntries
    .map(e => Number(parseUploadUrl(e.uploadUrl)?.setNumber ?? e.metadata?.setNumber))
    .filter(n => Number.isFinite(n));
  const uniqueSets = [...new Set(allSets)];
  if (uniqueSets.every(s => known.has(s))) return known;
  const { data, error } = await supabase
    .from('games')
    .select('id, game_group_id, set, game_number')
    .eq('game_group_id', groupId);
  if (!error && Array.isArray(data)) {
    const setKey = data.some(r => r.set != null) ? 'set' : 'game_number';
    for (const row of data) {
      const s = Number(row?.[setKey]);
      if (Number.isFinite(s) && UUID_RE.test(row.id)) {
        if (!known.has(s)) known.set(s, row.id);
      }
    }
  } else {
    console.warn('resolveGameIdsForGroup: supabase lookup failed', error);
  }
  return known;
};
const getAuthHeaders = async (supabase) => {
  const session = await supabase.auth.getSession();
  const token = session?.data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const deleteByGameId = async (gameId, supabase) => {
  const headers = await getAuthHeaders(supabase);
  const res = await fetch(`/api/delete-game/${encodeURIComponent(gameId)}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    console.error('Server delete failed:', res.status, body);
  }
  return res.ok;
};
const abortAllTusInGroup = (uploadsArray, groupId) => {
  for (const u of uploadsArray ?? []) {
    const url = u?.uploadRef?.url;
    const parsed = parseUploadUrl(url);
    if (parsed?.groupId === groupId) {
      try { u.uploadRef?.abort?.(); } catch { }
    }
  }
};
const UploadOrderList = ({ uploads, setUploads, onRemove }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { pressDelay: 120, pressTolerance: 5 })
  );
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = uploads.findIndex(u => u.id === active.id);
    const newIndex = uploads.findIndex(u => u.id === over.id);
    const newUploads = arrayMove(uploads, oldIndex, newIndex).map((upload, idx) => ({
      ...upload,
      setNumber: idx + 1
    }));
    setUploads(newUploads);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
const UploadGameModal = forwardRef(({ isOpen, onBeforeOpen, onClose, teamId, onUpload, userId, resumeSilently, availableTeams, supabase }, ref) => {
  const parseGameNumFromTitle = (t = "") => {
    const m = /game\s*(\d+)/i.exec(t);
    return m ? parseInt(m[1], 10) : 0;
  };
  const parsePlayers = (value) =>
    (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  async function ensureNextGameRow(supabase, { teamId, date, players }) {
    const { data, error } = await supabase
      .from("games")
      .select("id,title")
      .eq("team_id", teamId)
      .eq("date", date);
    if (error) {
      console.error("ensureNextGameRow select error:", error);
      throw new Error("Could not check existing games");
    }
    let max = 0;
    for (const row of data || []) {
      const n = parseGameNumFromTitle(row.title);
      if (n > max) max = n;
    }
    const nextN = max + 1;
    const title = `${date} Game ${nextN}`;
    const video_url = `${date}_Game${nextN}_h.264.mp4`;
    const { data: existing, error: checkErr } = await supabase
      .from("games")
      .select("id")
      .eq("team_id", teamId)
      .eq("date", date)
      .eq("title", title)
      .maybeSingle();
    if (checkErr) {
      console.error("ensureNextGameRow check error:", checkErr);
      throw new Error("Could not verify game row");
    }
    if (existing?.id) {
      return { id: existing.id, gameNumber: nextN, title, video_url };
    }
    const payload = {
      team_id: teamId,
      date,
      title,
      video_url,
      players: parsePlayers(players),
    };
    const { data: inserted, error: insErr } = await supabase
      .from("games")
      .insert(payload)
      .select("id")
      .single();
    if (insErr) {
      console.error("ensureNextGameRow insert error:", insErr);
      throw new Error(insErr.message || "Failed to create game row");
    }
    return { id: inserted.id, gameNumber: nextN, title, video_url };
  }

  const [gameGroupId, setGameGroupId] = useState(() => crypto.randomUUID());
  const [uploads, setUploads] = useState([]);
  const [autofillDate, setAutofillDate] = useState(false);
  const [autofillPlayers, setAutofillPlayers] = useState(false);
  const uploadRef = useRef(null);
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
  const [toastType, setToastType] = useState(null);
  const [toastDuration, setToastDuration] = useState(null);
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
  const cancelGroupById = async (groupId) => {
    if (!groupId) return { deleted: 0 };
    abortAllTusInGroup(uploads, groupId);
    await deleteByGameId(groupId, supabase);
    const entries = getAllGroupEntries(groupId);
    for (const e of entries) {
      try { await removeFileHandleFromIndexedDB(e.key); } catch { }
      try { localStorage.removeItem(e.key); } catch { }
    }
    setUploads(prev => prev.filter(u => {
      const gid = parseUploadUrl(u?.uploadRef?.url)?.groupId ?? u?.metadata?.game_group_id;
      return gid !== groupId;
    }));
    return { deleted: 1 };
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
  useEffect(() => {
    if (!isOpen) endPickerSession();
  }, [isOpen]);
  const pickerRunIdRef = useRef(0);
  const reselectQueueRef = useRef([]);
  const pickerResolveRef = useRef(null);
  const pickerSessionRef = useRef({ active: false, changed: false });
  const onFocusListenerRef = useRef(null);
  const resolveOnFocusTimeoutRef = useRef(null);
  const dismissUpload = (id) => setUploads(prev => prev.filter(u => u.id !== id));
  async function verifyTusCompletion(url, expectedSize) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'Tus-Resumable': '1.0.0' }
      });
      if (!res.ok) return false;
      const offset = parseInt(res.headers.get('Upload-Offset') || '0', 10);
      const length = parseInt(res.headers.get('Upload-Length') || String(expectedSize), 10);
      return offset === length;
    } catch {
      return false;
    }
  }
  const waitForUserActivation = () =>
    new Promise((resolve) => {
      if (navigator.userActivation?.isActive) return resolve();
      const onActivate = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        document.removeEventListener('pointerdown', onActivate, true);
        document.removeEventListener('keydown', onActivate, true);
      };
      document.addEventListener('pointerdown', onActivate, true);
      document.addEventListener('keydown', onActivate, true);
    });
  const endPickerSession = () => {
    if (onFocusListenerRef.current) {
      window.removeEventListener('focus', onFocusListenerRef.current, true);
      onFocusListenerRef.current = null;
    }
    if (resolveOnFocusTimeoutRef.current) {
      clearTimeout(resolveOnFocusTimeoutRef.current);
      resolveOnFocusTimeoutRef.current = null;
    }
    if (fallbackFileInputRef.current && pickerSessionRef.current) {
      fallbackFileInputRef.current.multiple = pickerSessionRef.current.wasMultiple ?? true;
    }
    if (pickerSessionRef.current) {
      pickerSessionRef.current.active = false;
      pickerSessionRef.current.finished = true;
    }
    pickerResolveRef.current = null;
  };
  const spawnPickerAndWait = () =>
    new Promise((resolve) => {
      if (resolveOnFocusTimeoutRef.current) {
        clearTimeout(resolveOnFocusTimeoutRef.current);
        resolveOnFocusTimeoutRef.current = null;
      }
      const runId = ++pickerRunIdRef.current;
      const now = performance.now();
      pickerSessionRef.current = {
        active: true,
        changed: false,
        finished: false,
        runId,
        armedAt: now,
        wasMultiple: fallbackFileInputRef.current?.multiple ?? true
      };
      pickerResolveRef.current = (result) => {
        if (pickerSessionRef.current?.finished) return;
        pickerSessionRef.current.finished = true;
        try {
          resolve(result);
        } finally {
          endPickerSession();
        }
      };
      if (fallbackFileInputRef.current) {
        fallbackFileInputRef.current.multiple = false;
      }
      const onFocus = () => {
        const sess = pickerSessionRef.current;
        if (!sess || sess.runId !== runId) return;
        if (performance.now() - sess.armedAt < 200) return;
        resolveOnFocusTimeoutRef.current = setTimeout(() => {
          if (sess.active && !sess.changed && !sess.finished) {
            sess.active = false;
            pickerResolveRef.current?.({ cancelled: true });
          }
          window.removeEventListener('focus', onFocus, true);
          onFocusListenerRef.current = null;
          resolveOnFocusTimeoutRef.current = null;
        }, 350);
      };
      onFocusListenerRef.current = onFocus;
      window.addEventListener('focus', onFocus, true);
      (async () => {
        try {
          await waitForUserActivation();
          fallbackFileInputRef.current?.click();
        } catch {
        }
      })();
    });
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

  const getNextSetNumberForGroup = (uploads, groupId) => {
    const groupUploads = uploads.filter(u => u.metadata?.game_group_id === groupId);
    const existingNumbers = groupUploads.map(u => u.setNumber).filter(Boolean);
    let num = 1;
    while (existingNumbers.includes(num)) {
      num++;
    }
    return num;
  };
  useImperativeHandle(ref, () => ({
    probeResumableState: async () => {
      const pending = scanIncompleteUploads();
      let withHandle = 0;
      let withoutHandle = 0;
      for (const entry of pending) {
        try {
          const fh = await getFileHandleFromIndexedDB(entry.key);
          if (fh) withHandle++; else withoutHandle++;
        } catch {
          withoutHandle++;
        }
      }
      return { total: pending.length, withHandle, withoutHandle };
    },
    cancelUploads: async () => {
      const pending = scanIncompleteUploads();
      if (pending.length === 0) {
        setToast('No resumable uploads found', 'error');
        return;
      }
      const groups = new Map();
      for (const entry of pending) {
        const parsed = parseUploadUrl(entry?.uploadUrl || entry?.url);
        if (parsed?.groupId) groups.set(parsed.groupId, true);
      }
      if (groups.size === 0) {
        setToast('No valid pending uploads found', 'error');
        return;
      }
      let groupsCancelled = 0;
      for (const groupId of groups.keys()) {
        try {
          await cancelGroupById(groupId);
          groupsCancelled++;
        } catch (err) {
          console.error('Unexpected cancel failure for group', groupId, err);
        }
      }
      setToast(
        `Cancelled ${groupsCancelled} group${groupsCancelled === 1 ? '' : 's'}`,
        'success'
      );
    },
    triggerResumeAllUploads: async () => {
      const pending = scanIncompleteUploads(); // all tus::* for this user
      if (pending.length === 0) {
        setToast('No resumable uploads found', 'error');
        return;
      }
      const withHandles = [];
      const withoutHandles = [];
      for (const entry of pending) {
        const fh = await getFileHandleFromIndexedDB(entry.key);
        if (fh) withHandles.push({ entry, fileHandle: fh });
        else withoutHandles.push(entry);
      }
      for (const { entry, fileHandle } of withHandles) {
        try {
          if (typeof fileHandle.requestPermission !== 'function') {
            continue;
          }
          const permission = await fileHandle.requestPermission();
          if (permission !== 'granted') {
            setToast(`Permission denied for ${entry.metadata.filename}`, 'error');
            continue;
          }
          const file = await fileHandle.getFile();
          const metadata = entry.metadata;
          if (metadata?.date) { setDate(metadata.date); setAutofillDate(true); }
          if (metadata?.players) { setPlayers(metadata.players); setAutofillPlayers(true); }
          const fingerprint = await customFingerprint(file, { endpoint: TUS_ENDPOINT, metadata });
          const exists = uploads.some(u => u.id === fingerprint);
          if (!exists) {
            setUploads(prev => [...prev, {
              file, progress: 0, status: 'pending', paused: false, uploadRef: null,
              fileHandle, id: fingerprint, setNumber: parseInt(metadata.setNumber, 10), metadata
            }]);
          }
          setTimeout(() => handleSubmit(fingerprint, file, metadata.date, metadata.players, fingerprint), 0);
        } catch (err) {
          setToast(`Could not access file ${entry.metadata?.filename}.`, 'error');
        }
      }
      reselectQueueRef.current = withoutHandles;
      while (reselectQueueRef.current.length > 0) {
        const entry = reselectQueueRef.current[0];
        const m = entry.metadata || {};
        setDate(m.date || ''); setPlayers(m.players || '');
        setAutofillDate(!!m.date); setAutofillPlayers(!!m.players);
        const needsActivation = !(navigator.userActivation?.isActive);
        setToast(
          `${needsActivation ? 'Tap/click to continue. ' : ''}Please re-select ${m.filename || 'the same file'} to resume.`,
          'neutral',
          10000
        );
        const { file, cancelled } = await spawnPickerAndWait();
        if (cancelled) {
          await cancelOneResumable(entry);
          reselectQueueRef.current.shift();
          continue;
        }
        if (!file) continue;
        if (m.filename && file.name !== m.filename) {
          setToast(`Selected "${file.name}" but expected "${m.filename}". Please re-select.`, 'error', 8000);
          continue;
        }
        const fingerprint = await customFingerprint(file, { endpoint: TUS_ENDPOINT, metadata: m });
        const exists = uploads.some(u => u.id === fingerprint);
        if (!exists) {
          setUploads(prev => [...prev, {
            file,
            progress: 0,
            status: 'pending',
            paused: false,
            uploadRef: null,
            fileHandle: null,
            id: fingerprint,
            setNumber: parseInt(m.setNumber, 10),
            metadata: m
          }]);
        }
        setTimeout(() => handleSubmit(fingerprint, file, m.date, m.players, fingerprint), 0);
        reselectQueueRef.current.shift();
      }
    }
  }));
  const cancelOneResumable = async (entry) => {
    const extractTusId = (url) => {
      try {
        if (!url) return null;
        const u = new URL(url, window.location.origin);
        const parts = u.pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || null;
      } catch { return null; }
    };
    const tusUrl = entry?.url || entry?.uploadUrl;
    const tusId = extractTusId(tusUrl);
    if (tusId) {
      await cancelUpload(undefined, tusId);
    }
    try { await removeFileHandleFromIndexedDB(entry.key); } catch { }
    localStorage.removeItem(entry.key);
  };
  const fallbackFileInputRef = useRef(null);
  const handleFallbackFileInputChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (pickerResolveRef.current) {
      pickerSessionRef.current.changed = true;
      if (onFocusListenerRef.current) {
        window.removeEventListener('focus', onFocusListenerRef.current, true);
        onFocusListenerRef.current = null;
      }
      if (resolveOnFocusTimeoutRef.current) {
        clearTimeout(resolveOnFocusTimeoutRef.current);
        resolveOnFocusTimeoutRef.current = null;
      }
      if (fallbackFileInputRef.current) {
        fallbackFileInputRef.current.multiple = pickerSessionRef.current?.wasMultiple ?? true;
      }
      const resolve = pickerResolveRef.current;
      pickerResolveRef.current = null;
      const file = files[0] || null;
      e.target.value = '';
      resolve({ file, cancelled: false });
      return;
    }
    const validFiles = [];
    let invalidCount = 0;
    for (const file of files) {
      if (file.type === 'video/mp4') {
        const metadata = {
          filename: file.name,
          filetype: file.type,
          date,
          players,
          team_id: teamId,
          user_id: userId,
          game_group_id: gameGroupId,
          setNumber: (uploads.length + validFiles.length + 1).toString(),
        };
        const fingerprint = await customFingerprint(file, {
          endpoint: TUS_ENDPOINT,
          metadata,
        });
        if (
          uploads.some(u => u.file.name === file.name) ||
          validFiles.some(u => u.file.name === file.name)
        ) continue;
        validFiles.push({
          file,
          progress: 0,
          status: 'pending',
          paused: false,
          uploadRef: null,
          fileHandle: null,
          id: fingerprint,
          setNumber: getNextSetNumberForGroup([...uploads, ...validFiles], metadata.game_group_id),
          metadata,
        });
      } else {
        invalidCount++;
      }
    }
    if (invalidCount > 0) {
      setToast(`${invalidCount} invalid file(s) skipped (only MP4 allowed)`);
    }
    const remainingSlots = 5 - uploads.length;
    const uploadsToAdd = validFiles.slice(0, remainingSlots);
    if (uploadsToAdd.length > 0) {
      setUploads(prev => [...prev, ...uploadsToAdd]);
    }
    if (uploadsToAdd.length < validFiles.length) {
      setToast('Only 5 files allowed. Some were not added.');
    }
    e.target.value = '';
  };
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
      fallbackFileInputRef.current?.click();
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
          team_id: teamId,
          user_id: userId,
          game_group_id: gameGroupId,
          setNumber: (uploads.length + 1).toString()
        };
        const fingerprint = await customFingerprint(file, { endpoint: TUS_ENDPOINT, metadata });
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
          setNumber: getNextSetNumberForGroup([...uploads, ...newUploads], metadata.game_group_id),
          metadata
        });
      }
      if (invalidCount > 0) {
        setToast(`${invalidCount} invalid file(s) skipped (only MP4 allowed)`);
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
        setToast('Only 5 files allowed. Some were not added.');
      }
    } catch (err) {
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

  const cancelUpload = async (uploadId, tusUploadId = null) => {
    try {
      let groupId = null;
      if (tusUploadId) {
        const match = uploads.find(u => u.uploadRef?.url?.endsWith(`/${tusUploadId}`));
        try { match?.uploadRef?.abort?.(); } catch { }
        let parsed = parseUploadUrl(match?.uploadRef?.url);
        if (!parsed) {
          const suffix = `/${tusUploadId}`;
          const ls = readTusEntriesFromLocalStorage();
          const m = ls.find(e => String(e.uploadUrl || '').endsWith(suffix));
          parsed = parseUploadUrl(m?.uploadUrl);
        }
        groupId = parsed?.groupId ?? null;
      } else {
        const u = uploads.find(x => x.id === uploadId);
        if (!u) return;
        try { u.uploadRef?.abort?.(); } catch { }
        const parsed = parseUploadUrl(u?.uploadRef?.url);
        groupId = parsed?.groupId ?? u?.metadata?.game_group_id ?? null;
      }
      if (!groupId) {
        console.warn('cancelUpload: no groupId resolved');
        return;
      }
      await cancelGroupById(groupId);
    } catch (err) {
      console.error('cancelUpload failed', err);
    }
  };
  const handleSubmit = async (uploadId, fileOverride = null, dateOverride = null, playersOverride = null, tusKeyOverride = null, metaOverride = null) => {
    const uploadItem = uploads.find(u => u.id === uploadId);
    if (!uploadItem && !fileOverride) {
      setToast('No file selected for upload');
      return;
    }
    const fileToUpload = fileOverride || uploadItem.file;
    const dateToUse = dateOverride || date;
    const playersToUse = playersOverride || players;
    let fileHandleSaved = false;
    let hit100 = false;
    const baseMeta = {
      filename: fileToUpload.name,
      filetype: fileToUpload.type,
      date: dateToUse,
      players: playersToUse,
      team_id: teamId,
      user_id: userId,
      game_group_id: uploadItem?.metadata?.game_group_id || gameGroupId,
      setNumber: (uploadItem?.setNumber ?? 1).toString(),
      total_sets:
        uploadItem?.metadata?.total_sets ||
        String(
          uploads.filter(u =>
            u.metadata?.game_group_id === (uploadItem?.metadata?.game_group_id || gameGroupId)
          ).length || 1
        ),
      game_number: uploadItem?.metadata?.game_number || '1',
    };
    const finalMeta = { ...baseMeta, ...(metaOverride || {}) };
    setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, metadata: { ...u.metadata, ...finalMeta } } : u));
    const upload = new tus.Upload(fileToUpload, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000],
      metadata: finalMeta,
      fingerprint: customFingerprint,
      onProgress: async (bytesUploaded, bytesTotal) => {
        const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);
        if (percentage >= 100) hit100 = true;
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
        const extractTusId = (url) => {
          try {
            if (!url) return null;
            const u = new URL(url, window.location.origin);
            const parts = u.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || null;
          } catch { return null; }
        };
        async function finalizeOnServer(tusId) {
          const headers = await getAuthHeaders(supabase);
          headers['Content-Type'] = 'application/json';
          let delay = 400;
          for (let attempt = 1; attempt <= 8; attempt++) {
            const res = await fetch('/api/finalize-upload', {
              method: 'POST',
              headers,
              body: JSON.stringify({ id: tusId }),
            });
            if (res.ok) return true;
            if (res.status === 409) {
              await new Promise(r => setTimeout(r, delay));
              delay = Math.min(delay * 1.7, 4000);
              continue;
            }
            if (res.status === 404) return true;
            return false;
          }
          return false;
        }
        const tusId = extractTusId(upload.url);
        if (tusId) {
          const ok = await finalizeOnServer(tusId);
          if (!ok) {
            setToast('Uploaded, but finalizing on server failed. It will retry shortly.', 'error', 6000);
          }
        }
        setUploads(prev => prev.map(u => (u.id === uploadId ? { ...u, status: 'success' } : u)));
        setToast("Game uploaded successfully! We'll email you when it's done being processed.", 'success');
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
      },
      onError: async (error) => {
        console.error('Upload failed:', error);
        if (hit100 && upload.url && await verifyTusCompletion(upload.url, fileToUpload.size)) {
          setUploads(prev => prev.map(u => (u.id === uploadId ? { ...u, status: 'success', progress: 100 } : u)));
          setToast('Game uploaded successfully!', 'success');
          setTimeout(() => dismissUpload(uploadId), 5000);
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
          return;
        }
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'error' } : u));
        setToast(`Upload failed${error?.message ? `: ${error.message}` : ''}`);
      },
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
      <input
        ref={fallbackFileInputRef}
        type="file"
        accept="video/mp4"
        multiple
        onChange={handleFallbackFileInputChange}
        style={{ display: 'none' }}
      />
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
            className={`mt-6 border-2 border-dashed border-gray-300 rounded-lg px-6 pt-4 pb-4 text-center relative transition-all ${isDragging ? 'border-blue-500 ring-2 ring-blue-300' : ''
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
                    team_id: teamId,
                    user_id: userId,
                    game_group_id: gameGroupId,
                    setNumber: (uploads.length + validFiles.length + 1).toString()
                  };
                  const fingerprint = await customFingerprint(file, { endpoint: TUS_ENDPOINT, metadata });
                  validFiles.push({
                    file,
                    progress: 0,
                    status: 'pending',
                    paused: false,
                    uploadRef: null,
                    fileHandle: null,
                    id: fingerprint,
                    setNumber: getNextSetNumberForGroup([...uploads, ...validFiles], metadata.game_group_id),
                    metadata
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
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                  setToast('Date format should be YYYY-MM-DD', 'error');
                  return;
                }
                if (!players.trim()) {
                  setToast('Please enter players (comma-separated)', 'error');
                  return;
                }
                const pending = uploads.filter(u => u.status === 'pending');
                if (pending.length === 0) return;
                let rowInfo;
                try {
                  rowInfo = await ensureNextGameRow(supabase, { teamId, date, players });
                } catch (e) {
                  console.error(e);
                  setToast('Could not create game row. Are you a team captain?', 'error');
                  return;
                }
                const { id: gameId, gameNumber } = rowInfo;
                const totalSets = String(pending.length);
                // Start uploads without relying on setState to carry metadata
                let hasValidationErrors = false;
                for (const u of pending) {
                  const res = await handleSubmit(
                    u.id,
                    null, null, null, null,
                    { game_group_id: gameId, total_sets: totalSets, game_number: String(gameNumber) }
                  );
                  if (res === 'validation-error') hasValidationErrors = true;
                }
                if (!hasValidationErrors) onClose();
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
                  <div className="absolute inset-0 w-full px-1 text-xs font-medium text-black opacity-55 pointer-events-none flex items-center justify-between">
                    <div className="text-left opacity-55">
                      Game ID: {upload.metadata?.game_group_id?.slice(-6) || '------'}
                    </div>
                    <div className="w-7 text-left">
                      Set {upload.setNumber}
                    </div>
                  </div>
                </div>
                <div className="flex-grow flex justify-end items-center ml-3">
                  <span className="text-sm font-medium text-gray-700 mr-2">
                    {upload.status === 'success' && 'Done'}
                    {upload.status === 'error' && 'Failed'}
                    {upload.status === 'cancelled' && 'Cancelled'}
                    {(upload.status === 'uploading' || upload.status === 'paused') && `${upload.paused ? 'Paused' : 'Uploading'}... ${upload.progress}%`}
                  </span>
                  {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'error' || upload.status === 'cancelled') && (
                    <>
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
                      {(upload.status === 'error' || upload.status === 'cancelled') && (
                        <>
                          <button
                            onClick={() => handleSubmit(upload.id)}
                            className="w-6 h-6 mr-1 cursor-pointer rounded-md hover:bg-gray-100"
                            title="Retry"
                          >
                            {/* simple retry icon */}
                            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="black">
                              <path d="M12 5v2a5 5 0 1 1-4.9 6h2.1a3 3 0 1 0 2.8-4H9l3-3z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => dismissUpload(upload.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100"
                            title="Dismiss"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      )}
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
            {(() => {
              const hovered = uploads.find(u => u.id === isProgressHovering);
              const fileName = hovered?.file?.name || 'Unknown file';
              const teamName = availableTeams?.find(t => String(t.id) === String(hovered?.metadata?.team_id))?.name ?? 'Unknown team';
              return (
                <>
                  <div>Uploading {fileName}</div>
                  <div style={{ fontSize: '11px', color: '#ccc' }}>Team: {teamName}</div>
                </>
              );
            })()}
          </div>
        </TooltipPortal>
      )}
    </>
  );
});
export default UploadGameModal;