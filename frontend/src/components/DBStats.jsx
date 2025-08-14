import React, { useRef, useMemo, useEffect, useLayoutEffect, useState } from 'react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import SortableFilterHeader from './SortableFilterHeader';
import EditableCell from './EditableCell';
import TooltipPortal from '../utils/tooltipPortal';
import Toast from './Toast';

const ROW_HEIGHT = 28; // px

const OuterDiv = React.forwardRef(function OuterDiv({ style, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`db-list-outer ${className || ''}`}
      style={{
        ...style,
        overflowX: 'auto',
        background: 'transparent',
        scrollbarGutter: 'stable',
        touchAction: 'pan-x pan-y',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'auto',
      }}
      {...rest}
    />
  );
});

const IconWithTooltip = ({ children, tooltip }) => {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (hovered && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setCoords({ top: rect.top - 36, left: rect.left + rect.width / 2 });
    }
  }, [hovered]);
  return (
    <>
      <div ref={ref} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="inline-block">
        {children}
      </div>
      {hovered && tooltip && (
        <TooltipPortal>
          <div className="fixed z-[9999] bg-black text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap" style={{ top: coords.top, left: coords.left, transform: 'translateX(-50%)' }}>
            {tooltip}
          </div>
        </TooltipPortal>
      )}
    </>
  );
};

const DBStats = ({
  canEdit,
  editMode,
  hastimestamps,
  isscored,  
  stats,
  refreshStats,
  setStats,
  filteredStats,
  gamePlayers,
  visibleColumns,
  sortConfig,
  setSortConfig,
  textColumnFilters,
  handleTextColumnFilterChange,
  renderCell,
  insertButtonParentRef,
  layoutMode,
  jumpToTime,
  videoRef,
  videoPlayerRef,
  mainContentRef,
  containerRef,
  formatTimestamp,
  gameId,
  refreshGames,
  supabase,
}) => { 
  const [filterPortalEl, setFilterPortalEl] = useState(null);
  const HIGHLIGHT_PRE_BUFFER = 2;
  const HIGHLIGHT_PLAY_DURATION = 5 - HIGHLIGHT_PRE_BUFFER;
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [showToast, setShowToast] = useState(false);  
  const setToast = (message, type = 'error') => { setToastMessage(message); setToastType(type); setShowToast(true); };
  const cellRefs = useRef({});
  
  const handleClearAllFilters = () => {
    window.dispatchEvent(new Event('closeAllFilters'));
    const keys = Object.keys(textColumnFilters ?? {});
    keys.forEach((k) => handleTextColumnFilterChange(k, null));
    requestAnimationFrame(() => {
      rowHeightsRef.current.clear?.();
      listRef.current?.resetAfterIndex?.(0, true);
    });
  };

  const isFiltered = useMemo(() => {
    const filtersObj = textColumnFilters ?? {};
    return Object.values(filtersObj).some((filter) => {
      const conditions = Array.isArray(filter?.conditions) ? filter.conditions : [];
      return conditions.some(({ operator, value }) =>
        ['blank', 'not_blank'].includes(operator) ||
        (operator === 'between'
          ? value?.min?.toString().trim() || value?.max?.toString().trim()
          : value?.toString().trim())
      );
    });
  }, [textColumnFilters]);
  
  const [gameSettings, setGameSettings] = useState({ hastimestamps: null, isscored: null });
  useEffect(() => {
    if (typeof hastimestamps === 'boolean' || typeof isscored === 'boolean') {
      setGameSettings({ hastimestamps, isscored });
    }
  }, [hastimestamps, isscored]);

  const handlePlayFiltered = async () => {
    const timestamps = filteredStats
      .filter(s => s.timestamp != null)
      .map(s => s.timestamp)
      .sort((a, b) => a - b);

    if (timestamps.length === 0 || !videoPlayerRef.current) return;

    const sequences = [];
    let lastEnd = -Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const current = timestamps[i];
      const next = timestamps[i + 1];
      const start = current - HIGHLIGHT_PRE_BUFFER;
      if (start < lastEnd) continue;

      const defaultEnd = current + HIGHLIGHT_PLAY_DURATION;
      const nextClipStart = next != null ? next - HIGHLIGHT_PRE_BUFFER : Infinity;
      const end = nextClipStart < defaultEnd ? next + HIGHLIGHT_PLAY_DURATION : defaultEnd;
      sequences.push([start, end]);
      lastEnd = end;
    }
    if (
      layoutMode === 'stacked' &&
      !document.pictureInPictureElement &&
      mainContentRef.current &&
      containerRef.current
    ) {
      const scrollContainer = mainContentRef.current;
      const videoEl = containerRef.current;
      const videoBottom = videoEl.offsetTop + videoEl.offsetHeight;
      const scrollTarget = videoBottom - scrollContainer.clientHeight;
      scrollContainer.scrollTo({ top: scrollTarget });
    }
    await videoPlayerRef.current.playCustomSequences(sequences);
  };

  const headerTableRef = useRef(null);
  const headerScrollRef = useRef(null);
  const listOuterRef = useRef(null); 
 const setHeaderScrollEl = React.useCallback((el) => {
   headerScrollRef.current = el;
 }, []);

 const setBodyOuterEl = React.useCallback((el) => {
   listOuterRef.current = el;
 }, []);
  const listRef = useRef(null);

  const rowHeightsRef = useRef(new Map());
  const getItemSize = (index) => rowHeightsRef.current.get(index) ?? ROW_HEIGHT;   

  const getTotalListHeight = () => {
    let sum = 0;
    const map = rowHeightsRef.current;
    map.forEach((v) => (sum += v));
    const unknownCount = Math.max(0, filteredStats.length - map.size);
    sum += unknownCount * ROW_HEIGHT;
    return sum;
  };  

  const [vh60, setVh60] = useState(() => Math.round(window.innerHeight * 0.60));
  useEffect(() => {
    const onResize = () => setVh60(Math.round(window.innerHeight * 0.60));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);  

  const [columnWidths, setColumnWidths] = useState({});
  const [listNonce, setListNonce] = useState(0);
  const [measuredColPx, setMeasuredColPx] = useState({});

  const orderedKeys = useMemo(() => {
    const all = Object.keys(visibleColumns).filter(k => visibleColumns[k]?.visible);
    const withoutNotes = all.filter(k => k !== 'notes');
    if (visibleColumns.notes?.visible) withoutNotes.push('notes');
    return withoutNotes;
  }, [visibleColumns]);

  const bodyColumns = useMemo(() => {
    const cols = [];
    if (editMode === 'admin') cols.push({ key: '__insert__' });
    if (visibleColumns.timestamp?.visible) cols.push({ key: 'timestamp' });
    for (const key of orderedKeys) {
      if (key === 'score' || key === 'timestamp') continue;
      cols.push({ key });
    }
    if (editMode === 'admin') cols.push({ key: '__delete__' });
    return cols;
  }, [orderedKeys, visibleColumns, editMode]);

  const flexKey = useMemo(() => {
    const keys = bodyColumns.map(c => c.key).filter(k => k !== '__insert__' && k !== '__delete__');
    return keys.includes('notes') ? 'notes' : keys[keys.length - 1];
  }, [bodyColumns]); 

  // Initial column widths based on header ths
  useLayoutEffect(() => {
    if (!headerTableRef.current) return;
    const ths = headerTableRef.current.querySelectorAll('thead th[data-key]');
    const next = { ...columnWidths };
    ths.forEach(th => {
      const k = th.dataset.key;
      if (!k) return;
      const w = Math.floor(th.getBoundingClientRect().width);
      if (k === flexKey) {
        delete next[k];
      } else {
        next[k] = w;
      }
    });
    setColumnWidths(next);
  }, [flexKey, orderedKeys]);  

  useEffect(() => {
    if (!headerTableRef.current) return;
    const keys = bodyColumns.map(c => c.key).filter(k => k !== '__insert__' && k !== '__delete__');
    const already = Object.keys(columnWidths);
    const needInit = keys.some(k => k !== flexKey && !already.includes(k));
    if (!needInit) return;
    const ths = headerTableRef.current.querySelectorAll('thead th[data-key]');
    const next = { ...columnWidths };
    ths.forEach(th => {
      const k = th.dataset.key;
      if (k && k !== flexKey) next[k] = Math.floor(th.getBoundingClientRect().width);
    });
    setColumnWidths(next);
  }, [bodyColumns, flexKey]);
  
  // Track live measured header cell widths
  useLayoutEffect(() => {
    const table = headerTableRef.current;
    if (!table) return;
    const ths = Array.from(table.querySelectorAll('thead th[data-key]'));
    if (!ths.length) {
      setMeasuredColPx({});
      return;
    }
    const read = () => {
      const next = {};
      ths.forEach((th) => {
        const key = th.dataset.key;
        if (!key) return;
        next[key] = th.getBoundingClientRect().width;
      });
      setMeasuredColPx(next);
    };
    read();
    const ro = new ResizeObserver(read);
    ths.forEach((th) => ro.observe(th));
    return () => ro.disconnect();
  }, [visibleColumns, sortConfig, textColumnFilters, editMode]);
  
  const didInitialAutofit = useRef(false);
  useLayoutEffect(() => {
    if (didInitialAutofit.current) return;
    let raf;
    const tick = () => {
      if (!headerTableRef.current || !listOuterRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const keys = bodyColumns.map(c => c.key).filter(k => k !== '__insert__' && k !== '__delete__' && k !== flexKey);
      const allReady = keys.every(k => listOuterRef.current.querySelector(`[role="cell"][data-field="${k}"]`));
      if (!allReady) {
        raf = requestAnimationFrame(tick);
        return;
      }
      keys.forEach(k => autofitColumn(k));
      didInitialAutofit.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bodyColumns, flexKey]);

  useEffect(() => {
    if (!headerTableRef.current || !listOuterRef.current) return;
    const keys = bodyColumns.map(c => c.key).filter(k => k !== '__insert__' && k !== '__delete__' && k !== flexKey);
    keys.forEach(k => autofitColumn(k));
  }, [bodyColumns, flexKey]);

  // Compute total pixel width needed for all columns.
  const totalColumnsPx = useMemo(() => {
    const widthFor = (key) => {
      if (key === '__insert__' || key === '__delete__') return 32;
      if (key === flexKey) {
        return Math.max(
          60,
          Math.floor(columnWidths[flexKey] ?? measuredColPx[flexKey] ?? 160)
        );
      }
      const explicit = columnWidths[key];
      if (explicit) return Math.max(60, Math.floor(explicit));
      const measured = measuredColPx[key];
      if (measured) return Math.max(60, Math.floor(measured));
      if (key === 'notes') return 200;
      return 120;
    };
    return bodyColumns.reduce((sum, { key }) => sum + widthFor(key), 0);
  }, [bodyColumns, columnWidths, measuredColPx, flexKey]);

  const [viewportW, setViewportW] = useState(0);
  
  useLayoutEffect(() => {
    const headerEl = headerScrollRef.current;
    const bodyEl   = listOuterRef.current;
    const containerEl = mainContentRef?.current || bodyEl || headerEl;
    const read = () => {
      const w = (bodyEl?.clientWidth ?? headerEl?.clientWidth ?? 0);
      setViewportW(w);
    };
    read();
    const ro = new ResizeObserver(() => {
      read();
    });
    if (containerEl) ro.observe(containerEl);
    if (headerEl && headerEl !== containerEl) ro.observe(headerEl);
    if (bodyEl && bodyEl !== containerEl) ro.observe(bodyEl);
    const onLayout = () => {
      requestAnimationFrame(read);
    };
    window.addEventListener('resize', onLayout);
    window.addEventListener('db_layout_change', onLayout);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('db_layout_change', onLayout);
    };
  }, [mainContentRef]);

  const { gridTemplate, canFit, totalPx } = useMemo(() => {
    const MIN_COL_PX  = 60;
    const FLEX_MIN_PX = 160;
    const available =
      listOuterRef.current?.clientWidth ??
      headerScrollRef.current?.clientWidth ??
      0;
    const widthForFixed = (key) => {
      if (key === '__insert__' || key === '__delete__') return 32;

      const explicit = columnWidths[key];
      if (explicit != null) return Math.max(MIN_COL_PX, Math.floor(explicit));

      const measured = measuredColPx[key];
      if (measured != null) return Math.max(MIN_COL_PX, Math.floor(measured));

      if (key === 'notes') return 200;
      return 120;
    };
    const fixedPx = bodyColumns.reduce((sum, { key }) => {
      if (key === flexKey) return sum;
      return sum + widthForFixed(key);
    }, 0);
    const canFitLocal = available > 0 && fixedPx + FLEX_MIN_PX <= available;
    const pinnedFlexPx = Math.max(
      MIN_COL_PX,
      Math.floor(
        columnWidths[flexKey] ??
        measuredColPx[flexKey] ??
        200
      )
    );
    const template = bodyColumns.map(({ key }) => {
      if (key === flexKey) {
        if (canFitLocal) {
          return `minmax(${FLEX_MIN_PX}px, 1fr)`;
        }
        return `${pinnedFlexPx}px`;
      }
      const w = widthForFixed(key);
      return `${w}px`;
    }).join(' ');
    const totalPxLocal = canFitLocal ? fixedPx + FLEX_MIN_PX : fixedPx + pinnedFlexPx;
    return { gridTemplate: template, canFit: canFitLocal, totalPx: totalPxLocal };
  }, [bodyColumns, columnWidths, measuredColPx, flexKey, viewportW]);

  useLayoutEffect(() => {
    listRef.current?.resetAfterIndex(0, true);
  }, [gridTemplate, columnWidths, viewportW]);
  
  const [isResizingCol, setIsResizingCol] = useState(false);
  
  useEffect(() => {
    const onStart = () => setIsResizingCol(true);
    const onEnd = () => {
     requestAnimationFrame(() => {
       rowHeightsRef.current.clear();
       listRef.current?.resetAfterIndex(0, true);
       requestAnimationFrame(() => {
         setIsResizingCol(false);
         listRef.current?.resetAfterIndex(0, true);
       });
     });
    };
    window.addEventListener('db_col_resize_start', onStart);
    window.addEventListener('db_col_resize_end', onEnd);
    return () => {
      window.removeEventListener('db_col_resize_start', onStart);
      window.removeEventListener('db_col_resize_end', onEnd);
    };
  }, []);
  
  useEffect(() => {
    rowHeightsRef.current.clear();
    requestAnimationFrame(() => {
      listRef.current?.resetAfterIndex(0, true);
    });
  }, [orderedKeys, gridTemplate]);

  const autofitAll = React.useCallback(() => {
    if (!headerTableRef.current || !listOuterRef.current) return;
    const keys = bodyColumns
      .map(c => c.key)
      .filter(k => k !== '__insert__' && k !== '__delete__' && k !== flexKey);
    keys.forEach(k => autofitColumn(k));
  }, [bodyColumns, flexKey]);
  
  useEffect(() => {
    let raf = requestAnimationFrame(() => autofitAll());
    return () => cancelAnimationFrame(raf);
  }, [textColumnFilters, sortConfig, visibleColumns, autofitAll]);

  useEffect(() => {
    const alignScroll = () => {
      if (headerScrollRef.current && listOuterRef.current) {
        headerScrollRef.current.scrollLeft = listOuterRef.current.scrollLeft;
      }
    };
    const schedule = () => requestAnimationFrame(() => { autofitAll(); alignScroll(); });
    window.addEventListener('resize', schedule);
    window.addEventListener('db_layout_change', schedule);
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('db_layout_change', schedule);
    };
  }, [autofitAll]);
  
  const filteredKey = React.useMemo(
    () => filteredStats.map(r => r.id).join('|'),
    [filteredStats]
  );
  
  useEffect(() => {
    rowHeightsRef.current.clear();
    listRef.current?.resetAfterIndex(0, true);
  }, [filteredStats, gridTemplate]);  

  const toggleGameField = async (field, value) => {
    if (!gameId) return;
    try {
      const { error } = await supabase
        .from('games')
        .update({ [field]: value })
        .eq('id', gameId);
      if (error) {
        setToast(`Failed to update ${field}: ${error.message}`);
        return;
      }
      refreshStats();
      if (refreshGames) refreshGames();
    } catch (err) {
      setToast(`Error updating ${field}`);
    }
  };

  const navigateToEditableCell = ({ idx, field, direction }) => {
    const keys = orderedKeys.filter((k) => k !== 'timestamp' && k !== 'score');
    const isEditable = (fieldName) => {
      if (editMode === 'admin') return true;
      const editableFieldsInEditorMode = ['player', 'action_type', 'quality', 'notes'];
      return editableFieldsInEditorMode.includes(fieldName);
    };
    let newIdx = idx;
    let colIndex = keys.indexOf(field);
    const MAX_ROWS = filteredStats.length;
    const MAX_COLS = keys.length;
    let guard = 0;
    while (guard++ < MAX_ROWS * MAX_COLS) {
      if (direction === 'next') {
        colIndex++;
        if (colIndex >= MAX_COLS) { colIndex = 0; newIdx++; }
      } else if (direction === 'prev') {
        colIndex--;
        if (colIndex < 0) { colIndex = MAX_COLS - 1; newIdx--; }
      } else if (direction === 'down') { newIdx++; }
      else if (direction === 'up') { newIdx--; }
      if (newIdx < 0 || newIdx >= MAX_ROWS) break;
      const nextField = keys[colIndex];
      if (isEditable(nextField)) {
        requestAnimationFrame(() => {
          const cellRef = cellRefs.current[`${newIdx}-${nextField}`];
          if (cellRef) { cellRef.clickToEdit?.(); requestAnimationFrame(() => cellRef.focusInput?.()); }
        });
        return;
      }
    }
  };

  const scrollSyncRef = useRef({ header: null, body: null, onHeader: null, onBody: null });
  useLayoutEffect(() => {
    const headerEl = headerScrollRef.current;
    const bodyEl   = listOuterRef.current;
    const prev = scrollSyncRef.current;
    const headerChanged = prev.header !== headerEl;
    const bodyChanged   = prev.body   !== bodyEl;
    if (!headerChanged && !bodyChanged) return;
    if (prev.header && prev.onHeader) prev.header.removeEventListener('scroll', prev.onHeader);
    if (prev.body   && prev.onBody)   prev.body.removeEventListener('scroll',   prev.onBody);
    if (!headerEl || !bodyEl) {
      scrollSyncRef.current = { header: headerEl, body: bodyEl, onHeader: null, onBody: null };
      return;
    }
    let isSyncing = false;
    const sync = (src, dst) => {
      if (isSyncing) return;
      isSyncing = true;
      dst.scrollLeft = src.scrollLeft;
      requestAnimationFrame(() => { isSyncing = false; });
    };
    const onHeader = () => sync(headerEl, bodyEl);
    const onBody   = () => sync(bodyEl, headerEl);

    headerEl.addEventListener('scroll', onHeader, { passive: true });
    bodyEl.addEventListener('scroll',   onBody,   { passive: true });
    headerEl.scrollLeft = bodyEl.scrollLeft;
    scrollSyncRef.current = { header: headerEl, body: bodyEl, onHeader, onBody };
  });

  useEffect(() => {
    return () => {
      const { header, body, onHeader, onBody } = scrollSyncRef.current;
      if (header && onHeader) header.removeEventListener('scroll', onHeader);
      if (body   && onBody)   body.removeEventListener('scroll',   onBody);
    };
  }, []);

  const Row = ({ index, style }) => {
    const rowRef = useRef(null);
    useLayoutEffect(() => {
      if (!rowRef.current) return;
      const measure = () => {
        const el = rowRef.current;
        if (!el) return;

        let measured = ROW_HEIGHT;
        el.querySelectorAll('[role="cell"]').forEach((c) => {
          const cellH = c.offsetHeight || ROW_HEIGHT;
          measured = Math.max(measured, cellH);
        });
        const h = measured + 1;
        const prev = rowHeightsRef.current.get(index) ?? ROW_HEIGHT;
        const DIFF_THRESHOLD = 2;
        if (Math.abs(h - prev) > DIFF_THRESHOLD) {
          rowHeightsRef.current.set(index, h);
          listRef.current?.resetAfterIndex(index, false);
        }
      };

      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(rowRef.current);
      let raf = null;
      if (!isResizingCol) {
        raf = requestAnimationFrame(measure);
      }
      return () => {
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
      };
    }, [index, filteredStats, gridTemplate, isResizingCol]);
    
    const s = filteredStats[index];
    const prevRow = index > 0 ? filteredStats[index - 1] : null;
    const idx = index;
    const isEditing = ['admin', 'editor'].includes(editMode);
    const onRowClick = !isEditing ? () => {
      const validTimestamps = stats.slice(0, idx).map(r => r.timestamp).filter(Boolean);
      if (s.timestamp != null) jumpToTime(s.timestamp);
      else if (validTimestamps.length > 0) jumpToTime(validTimestamps[validTimestamps.length - 1]);
      if (
        layoutMode === 'stacked' &&
        !document.pictureInPictureElement &&
        mainContentRef.current
      ) {
        mainContentRef.current.scrollTo({ top: 0 });
      }
    } : undefined;

    return (
      <div
        ref={rowRef}
        role="row"
        style={{ ...style, display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'stretch', minWidth: canFit ? 'auto' : totalPx }}
        className={`db-row ${!canEdit ? 'hover:bg-gray-50' : ''}`}
        onClick={onRowClick}
      >
        {editMode === 'admin' && (
          <div role="cell" className="db-cell" style={{ alignItems: 'flex-end' }}>
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform"
              onClick={async (e) => {
                e.stopPropagation();
                const newRow = {
                  game_id: s.game_id,
                  rally_id: s.rally_id,
                  import_seq: (s.import_seq || 0) + 0.01,
                  our_score: s.our_score,
                  opp_score: s.opp_score,
                  set: s.set,
                  team_id: s.team_id,
                };
                const { data, error } = await supabase
                  .from('stats')
                  .insert([newRow])
                  .select('*');
                if (!error && data?.length) {
                  const inserted = data[0];
                  const index = stats.findIndex(row => row.id === s.id);
                  const updated = [...stats];
                  updated.splice(index + 1, 0, inserted);
                  setStats(updated);
                  setToast('Added row.', 'success');
                } else {
                  setToast('Failed to insert row' + (error ? `: ${error.message}` : ''));
                }
              }}
            >
              <IconWithTooltip tooltip="Add row below">
                <svg viewBox="-2 -2 24.00 24.00" xmlns="http://www.w3.org/2000/svg" fill="none" className="w-5 h-5">
                  <rect x="-2" y="-2" width="24.00" height="24.00" rx="12" fill="#ccdfe5"></rect>
                  <path stroke="#88d8a0" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.343 4.343l11.314 11.314m0 0h-9.9m9.9 0v-9.9" />
                </svg>
              </IconWithTooltip>
            </button>
          </div>
        )}

        {visibleColumns.timestamp?.visible && (
          <div
            role="cell"
            data-field="timestamp"
            className={`db-cell ${editMode === 'admin' ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={editMode === 'admin' ? async (e) => {
              e.stopPropagation(); 
              const currentTimestamp = videoRef.current?.currentTime ?? 0;
              const { error } = await supabase
                .from('stats')
                .update({ timestamp: currentTimestamp })
                .eq('id', s.id);

              if (!error) {
                const statIndex = stats.findIndex(row => row.id === s.id);
                if (statIndex !== -1) {
                  const newStats = [...stats];
                  newStats[statIndex] = { ...stats[statIndex], timestamp: currentTimestamp };
                  setStats(newStats);
                }
              } else {
                setToast('Failed to update timestamp: ' + error.message);
              }
            } : undefined}
          >
            {s.timestamp != null ? (
              <span className="leading-normal">{formatTimestamp(s.timestamp)}</span>
            ) : (
              <span className="text-gray-400 italic leading-normal">—</span>
            )}
          </div>
        )}

        {orderedKeys.map((field) => {
          if (!visibleColumns[field]?.visible || field === 'score' || field === 'timestamp') return null;
          const highlightClass =
            field === 'our_score' && prevRow && s[field] > prevRow[field]
              ? 'bg-green-100 text-green-800'
              : field === 'opp_score' && prevRow && s[field] > prevRow[field]
              ? 'bg-red-100 text-red-800'
              : '';
          const editableFieldsInEditorMode = ['player', 'action_type', 'quality', 'notes'];
          const shouldRenderEditableCell = editMode === 'admin' || (editMode === 'editor' && editableFieldsInEditorMode.includes(field));
          return (
            <div key={field} role="cell" data-field={field} className={`db-cell ${highlightClass} ${shouldRenderEditableCell ? '' : 'cursor-default'}`}>
              {shouldRenderEditableCell ? (
                <EditableCell
                  ref={(el) => { cellRefs.current[`${idx}-${field}`] = el; }}
                  value={s[field]}
                  type={visibleColumns[field].type}
                  statId={s.id}
                  field={field}
                  idx={idx}
                  stats={stats}
                  setStats={setStats}
                  gamePlayers={gamePlayers}
                  setEditingCell={navigateToEditableCell}
                  setToast={setToast}
                  supabase={supabase}
                />
              ) : (
                s[field] ?? ''
              )}
            </div>
          );
        })}

        {editMode === 'admin' && (
          <div role="cell" className="db-cell" style={{ alignItems: 'center' }}>
            <button
              className="w-6 h-6 flex items-center justify-center rounded-full hover:scale-110 transition-transform "
              onClick={async (e) => {
                e.stopPropagation();
                const { error } = await supabase
                  .from('stats')
                  .delete()
                  .eq('id', s.id);
                if (!error) {
                  const updated = stats.filter(row => row.id !== s.id);
                  setStats(updated);
                  setToast('Deleted row');
                } else {
                  setToast('Delete failed: ' + error.message);
                }
              }}
            >
              <IconWithTooltip tooltip="Delete row">
                <svg viewBox="-102.4 -102.4 1228.80 1228.80" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none">
                  <rect x="-102.4" y="-102.4" width="1228.80" height="1228.80" rx="614.4" fill="#ccdfe5" />
                  <path d="M667.8 362.1H304V830c0 28.2 23 51 51.3 51h312.4c28.4 0 51.4-22.8 51.4-51V362.2h-51.3z" fill="#d24646"></path>
                  <path d="M750.3 295.2c0-8.9-7.6-16.1-17-16.1H289.9c-9.4 0-17 7.2-17 16.1v50.9c0 8.9 7.6 16.1 17 16.1h443.4c9.4 0 17-7.2 17-16.1v-50.9z" fill="#d24646"></path>
                  <path d="M733.3 258.3H626.6V196c0-11.5-9.3-20.8-20.8-20.8H419.1c-11.5 0-20.8 9.3-20.8 20.8v62.3H289.9c-20.8 0-37.7 16.5-37.7 36.8V346c0 18.1 13.5 33.1 31.1 36.2V830c0 39.6 32.3 71.8 72.1 71.8h312.4c39.8 0 72.1-32.2 72.1-71.8V382.2c17.7-3.1 31.1-18.1 31.1-36.2v-50.9c0.1-20.2-16.9-36.8-37.7-36.8z m-293.5-41.5h145.3v41.5H439.8v-41.5z m-146.2 83.1H729.5v41.5H293.6v-41.5z m404.8 530.2c0 16.7-13.7 30.3-30.6 30.3H355.4c-16.9 0-30.6-13.6-30.6-30.3V382.9h373.6v447.2z" fill="#211F1E"></path>
                  <path d="M511.6 798.9c11.5 0 20.8-9.3 20.8-20.8V466.8c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0 11.5 9.3 20.8 20.8 20.8zM407.8 798.9c11.5 0 20.8-9.3 20.8-20.8V466.8c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0 11.4 9.3 20.7 20.8 20.7zM615.4 799.6c11.5 0 20.8-9.3 20.8-20.8V467.4c0-11.5-9.3-20.8-20.8-20.8s-20.8 9.3-20.8 20.8v311.4c0 11.5 9.3 20.8 20.8 20.8z" fill="#211F1E"></path>
                </svg>
              </IconWithTooltip>
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <tr>
      {editMode === 'admin' && <th data-key="__insert__" style={{ width: 32 }} />}

      {orderedKeys.map((key) => {
        const config = visibleColumns[key];
        if (key === 'score') {
          return (
            <React.Fragment key="score-columns">
              <SortableFilterHeader
                columnKey="our_score"
                label="Our Score"
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                columnType={visibleColumns.our_score.type}
                filterValue={textColumnFilters.our_score}
                onFilterChange={handleTextColumnFilterChange}
                width={columnWidths.our_score}
                onResize={(w) => setColumnWidths(p => ({ ...p, our_score: w }))}
                onAutoFit={() => autofitColumn('our_score')}
                isLastColumn={'our_score' === flexKey}
                portalEl={filterPortalEl}
              />
              <SortableFilterHeader
                columnKey="opp_score"
                label="Opp Score"
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                columnType={visibleColumns.opp_score.type}
                filterValue={textColumnFilters.opp_score}
                onFilterChange={handleTextColumnFilterChange}
                width={columnWidths.opp_score}
                onResize={(w) => setColumnWidths(p => ({ ...p, opp_score: w }))}
                onAutoFit={() => autofitColumn('opp_score')}
                isLastColumn={'opp_score' === flexKey}
                portalEl={filterPortalEl}
              />
            </React.Fragment>
          );
        }
        if (["our_score", "opp_score"].includes(key) && visibleColumns.score?.visible) return null;

        return (
          <SortableFilterHeader
            key={key}
            columnKey={key}
            label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            sortConfig={sortConfig}
            onSortChange={setSortConfig}
            columnType={config.type}
            filterValue={textColumnFilters[key]}
            onFilterChange={handleTextColumnFilterChange}
            isFilterable={key !== 'timestamp'}
            width={columnWidths[key]}
            onResize={(w) => setColumnWidths(p => ({ ...p, [key]: w }))}
            onAutoFit={() => autofitColumn(key)}
            isLastColumn={key === flexKey}
            portalEl={filterPortalEl}
          />
        );
      })}

      {editMode === 'admin' && <th data-key="__delete__" style={{ width: 32 }} />}
    </tr>
  );

  const autofitColumn = (key) => {
    const th = headerTableRef.current?.querySelector(`thead th[data-key="${key}"]`);
    const current = th?.getBoundingClientRect().width ?? 0;
    const getNumber = (v) => (v ? parseFloat(v) || 0 : 0);
    let headerNeeded = 0;
    if (th) {
      const thCS = window.getComputedStyle(th);
      const thExtra = getNumber(thCS.paddingLeft) + getNumber(thCS.paddingRight) + getNumber(thCS.borderLeftWidth) + getNumber(thCS.borderRightWidth);
      const btn = th.querySelector('button');
      if (btn) {
        const clone = btn.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.whiteSpace = 'nowrap';
        clone.style.width = 'max-content';
        clone.style.display = 'inline-block';
        clone.classList?.remove('truncate');
        clone.classList?.remove('w-full');
        th.appendChild(clone);
        const labelW = Math.ceil(clone.getBoundingClientRect().width);
        th.removeChild(clone);
        headerNeeded = labelW + Math.ceil(thExtra);
      }
    }
    let cellsNeeded = 0;
    const outer = listOuterRef.current;
    if (outer) {
      outer.querySelectorAll(`[role="cell"][data-field="${key}"]`).forEach((el) => {
        const ctrl = el.querySelector('input,textarea,select') || el.firstElementChild || el;
        const sw = Math.ceil((ctrl?.scrollWidth) || 0);
        const cw = Math.ceil((ctrl?.clientWidth) || 0);
        const w = sw > cw ? sw : 0;
        if (w > cellsNeeded) cellsNeeded = w;
      });
    }
    const MIN = 60;
    let needed = Math.max(MIN, headerNeeded, cellsNeeded);
    if (needed > current + 5) {
      needed += 6;
    }
    setColumnWidths((prev) => ({ ...prev, [key]: needed }));
    requestAnimationFrame(() => {
      rowHeightsRef.current.clear();
      listRef.current?.resetAfterIndex(0, true);
    });
  };
  const EMPTY_MIN = 160;

  useLayoutEffect(() => {
    didInitialAutofit.current = false;
    setMeasuredColPx({});
    setColumnWidths(prev => {
      const next = { ...prev };
      delete next[flexKey];
      return next;
    });
    rowHeightsRef.current.clear?.();
    listRef.current?.resetAfterIndex?.(0, true);
    requestAnimationFrame(() => {
      autofitAll();
      listRef.current?.resetAfterIndex?.(0, true);
    });
  }, [layoutMode, flexKey, autofitAll]);

  return (
    <>
      {/* Toolbar shown when filters are active */}
      {isFiltered && (
        <div className={`px-4 pb-4 -mx-4 ${editMode ? 'bg-yellow-50' : ''}`}>
          <div className="db-toolbar flex items-center gap-3 flex-wrap">
            {filteredStats.length > 0 && (
              <button
                onClick={handlePlayFiltered}
                className="px-4 py-2 rounded-xl text-white font-semibold shadow-md transform transition hover:scale-[1.03]
                           bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
                aria-label="Play filtered touches"
              >
                Play Filtered Touches ({filteredStats.length})
              </button>
            )}
            {/* spacer pushes the next button to the right on wide screens */}
            <div className="db-toolbar-spacer flex-1" />

            <button
              onClick={handleClearAllFilters}
              className="px-4 py-2 rounded-xl text-white font-semibold shadow-md transform transition hover:scale-[1.03]
                         bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800"
              aria-label="Clear all filters"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}
      <div
        ref={setHeaderScrollEl}
        className="db-x-scroll"
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          position: 'relative',
          zIndex: 100,
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y'
        }}
      >
        <table className="w-full text-center" ref={headerTableRef} style={{ width: canFit ? '100%' : totalPx }}>
          <thead>{renderHeader()}</thead>
        </table>
      </div>
      <div ref={setFilterPortalEl} id="db-filter-portal" />
      <div
        className="relative mb-4"
        style={{
          height:
            filteredStats.length === 0
              ? Math.min(vh60, EMPTY_MIN)
              : Math.max(EMPTY_MIN, vh60),
          minHeight: filteredStats.length === 0 ? EMPTY_MIN : undefined,
          zIndex: 0,
        }}
      >
        {filteredStats.length > 0 ? (
          <AutoSizer>
            {({ height, width }) => {
              const contentHeight = getTotalListHeight();
              const listHeight = Math.min(height, contentHeight);

              return (
                <List
                  key={listNonce}
                  ref={listRef}
                  height={listHeight}
                  width={width}
                  itemCount={filteredStats.length}
                  itemSize={getItemSize}
                  overscanCount={10}
                  estimatedItemSize={ROW_HEIGHT} 
                  outerElementType={OuterDiv}
                  outerRef={setBodyOuterEl}
                >
                  {({ index, style }) => (
                    <Row index={index} style={{ ...style, minWidth: totalColumnsPx }} />
                  )}
                </List>
              );
            }}
          </AutoSizer>
        ) : (
          <div className="py-20 text-gray-500 italic text-center border-t">No matching data.</div>
        )}
      </div>

      {['admin', 'editor'].includes(editMode) && (
        <div className={`flex justify-between items-start pt-4 px-4 gap-6 ${editMode ? 'bg-yellow-50 transition-colors pb-4 rounded' : ''}`}>
          {editMode === 'admin' && (
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow mt-1"
              onClick={async () => {
                const lastRow = stats[stats.length - 1];
                const newRows = Array.from({ length: 10 }, (_, i) => ({
                  game_id: lastRow?.game_id,
                  rally_id: lastRow?.rally_id,
                  import_seq: (lastRow?.import_seq || 0) + 0.01 + i * 0.01,
                  our_score: lastRow?.our_score,
                  opp_score: lastRow?.opp_score,
                  set: lastRow?.set,
                  team_id: lastRow?.team_id,
                }));
                const { data, error } = await supabase
                  .from('stats')
                  .insert(newRows)
                  .select('*');

                if (!error && data?.length) {
                  setStats([...stats, ...data]);
                  setToast('Added 10 rows to bottom', 'success');
                } else {
                  setToast('Failed to add rows' + (error ? `: ${error.message}` : ''));
                }
              }}
            >
              ➕ Add 10 Rows to Bottom
            </button>
          )}
          <div className="mt-1 px-4 py-3 border rounded bg-gray-50 shadow-md w-fit">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-1">🛠 Update Game Settings</h3>
            <div className="flex flex-col space-y-3">
              <div className="flex justify-between items-center w-full">
                <label className="text-sm font-medium text-gray-700">Has Timestamps:</label>
                <select
                  disabled={editMode !== 'admin'}
                  className={`border border-gray-300 bg-white rounded px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${editMode !== 'admin' ? 'opacity-50' : ''}`}
                  value={gameSettings.hastimestamps ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === 'true';
                    setGameSettings(prev => ({ ...prev, hastimestamps: value }));
                    toggleGameField('hastimestamps', value);
                  }}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div className="flex justify-between items-center w-full">
                <label className="text-sm font-medium text-gray-700">Is Scored:</label>
                <select
                  disabled={!(editMode === 'admin' || editMode === 'editor')}
                  className={`border border-gray-300 bg-white rounded px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${!(editMode === 'admin' || editMode === 'editor') ? 'opacity-50' : ''}`}
                  value={gameSettings.isscored ?? ''}
                  onChange={(e) => {
                    const value = e.target.value === 'true';
                    setGameSettings(prev => ({ ...prev, isscored: value }));
                    toggleGameField('isscored', value);
                  }}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </div>
          <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 shadow mt-1" onClick={refreshStats}>🔄 Refresh DB</button>
        </div>     
      )}      
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} type={toastType} />         

      <style>{`
        .db-row { border-bottom: 1px solid #e5e7eb; }
        .db-cell { padding: 2px 4px; display: flex; align-items: center; justify-content: center; }
        .db-cell input, .db-cell select { height: auto; }
        .db-cell textarea { height: auto; min-height: 21px; resize: none; }
        .db-cell, .db-cell * { white-space: pre-wrap; word-break: break-word; }
        table { table-layout: fixed; border-collapse: collapse; width: 100%; }
        thead th { position: sticky; top: 0; background: #f3f4f6; z-index: 200; }

        /* Shared scroller cosmetics */
        .db-x-scroll::-webkit-scrollbar { height: 0px; }
        .db-x-scroll { scrollbar-width: none; overflow-y: visible; position: relative; }
        .db-list-outer {
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
          overscroll-behavior: auto;
          background: transparent;
          scrollbar-color: auto transparent;
        }
        .db-list-outer::-webkit-scrollbar { width: 0px; height: 0px; }
        .db-list-outer::-webkit-scrollbar-track { background: transparent; }
        .db-list-outer::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.4);
          border-radius: 4px;
        }
        .db-toolbar { /* already flex from JSX */ }
        .db-toolbar-spacer { flex: 1 1 auto; }
        @media (max-width: 360px) {
          .db-toolbar {
            flex-direction: column;
            align-items: flex-start;  /* left align when stacked */
            gap: 8px;
          }
          .db-toolbar-spacer {
            display: none;            /* no push-right on the stacked layout */
          }
        }        
      `}</style>
    </>
  );
};

export default DBStats;
