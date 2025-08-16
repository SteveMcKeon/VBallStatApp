import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useLayoutEffect  } from 'react';

const EditableCell = forwardRef(({ value, type, statId, field, idx, stats, setStats, gamePlayers, setEditingCell, setToast, supabase, practiceMode = false, parentHasHighlight = false }, ref) => {
  const RALLY_FIELD = 'rally_id';
  const SET_FIELD = 'set';  
  const RALLY_START = 1;
  const RESULT_OPTIONS = ['Won Point', 'Lost Point'];
  const POSITION_OPTIONS = ['Power', 'Middle', 'Opposite', 'Backrow'];
  const ACTION_TYPE_OPTIONS = [
    'Serve', 'Pass', 'Set', 'Tip', 'Hit', 'Block', 'Dig', 'Free'
  ];  
  const [interactionMode, setInteractionMode] = useState('keyboard');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value ?? '');
  const inputRef = useRef(null);
  const wrapperRef = useRef(null); 
  const [cellHeight, setCellHeight] = useState(null);
  const [cellWidth, setCellWidth] = useState(null);  
  const displayRef = useRef(null);
  const ghostRef = useRef(null);
  const lastAnnouncedH = useRef(0);  
  const isValidValue = () => {
    if ((value == null || value === '') && field !== 'set_to_position' && field !== 'set_to_player') return true;
    if (field === 'set_to_player') {
      const idxInAll = stats.findIndex(r => r.id === statId);
      const curRow = idxInAll >= 0 ? stats[idxInAll] : null;
      const curIsSet = (curRow?.action_type ?? '').toString().toLowerCase() === 'set';
      if (value == null || value === '') {
        return !curIsSet;
      }
      return gamePlayers.includes(value);
    }
    if (field === 'player') {
      return gamePlayers.includes(value);
    }
    if (field === 'action_type') {
      return ACTION_TYPE_OPTIONS.includes(value);
    }
    if (field === 'set_to_position') {
      const allowed = new Set(POSITION_OPTIONS.map(s => s.toLowerCase()));
      const typed = (value ?? '').toString().trim().toLowerCase();
      if (typed === '') {
        const idxInAll = stats.findIndex(r => r.id === statId);
        const curRow = idxInAll >= 0 ? stats[idxInAll] : null;
        const curIsSet = (curRow?.action_type ?? '').toString().toLowerCase() === 'set';
        return !curIsSet;
      }
      return allowed.has(typed);
    }
    return true;
  };
  const highlightClass = !editing && !isValidValue() ? 'bg-yellow-200 hover:bg-yellow-300' : (parentHasHighlight ? '' : 'hover:bg-gray-100');
  const measureGhost = () => {
    const gh = ghostRef.current?.getBoundingClientRect().height || 0;
    const h = Math.ceil(gh);
    if (h && h !== cellHeight) setCellHeight(h);
    if (h && h !== lastAnnouncedH.current) {
      lastAnnouncedH.current = h;
      window.dispatchEvent(new CustomEvent('db_row_maybe_grow', { detail: { index: idx, height: h } }));
    }
    return h;
  };
  const patchRowsRef = useRef(null);
  const normalizeResult = (res) => {
    const s = (res ?? '').toString().trim().toLowerCase();
    if (!s) return null;
    if (s === 'w' || s === 'win' || s.startsWith('won')) return 'Won Point';
    if (s === 'l' || s === 'loss' || s.startsWith('lost')) return 'Lost Point';
    return null;
  };
  const commitEdit = async (rawNext) => {   
    let parsed = rawNext;
    const isBlank =
      ['int2','int4','int8','float4','float8','numeric'].includes(type)
        ? rawNext?.trim?.() === '' : rawNext === '';
    if (['int2','int4','int8'].includes(type)) parsed = isBlank ? null : parseInt(rawNext);
    else if (['float4','float8','numeric'].includes(type)) parsed = isBlank ? null : parseFloat(rawNext);
    else parsed = isBlank ? null : rawNext;
    if (field === 'result') parsed = normalizeResult(parsed);
    const toNum = v => (v === null || v === undefined || v === '' ? null : Number(v));
    const prevComparable =
      field === 'result' ? normalizeResult(value)
      : (field === 'our_score' || field === 'opp_score') ? toNum(value)
      : (value ?? '');
    const nextComparable =
      field === 'result' ? normalizeResult(parsed)
      : (field === 'our_score' || field === 'opp_score') ? toNum(parsed)
      : (parsed ?? '');
    if (prevComparable === nextComparable) return;
    patchRowsRef.current = null;
    setStats(prev => {
      const next = [...prev];
      const idxInAll = next.findIndex(r => r.id === statId);
      if (idxInAll === -1) return prev;
      next[idxInAll] = { ...next[idxInAll], [field]: parsed };
      if (field === 'result') {
        let our = idxInAll > 0 ? Number(next[idxInAll - 1].our_score) || 0 : 0;
        let opp = idxInAll > 0 ? Number(next[idxInAll - 1].opp_score) || 0 : 0;
        let rally =
          idxInAll > 0
            ? (Number(next[idxInAll - 1][RALLY_FIELD]) || RALLY_START)
            : RALLY_START;
        const prevRes = idxInAll > 0 ? normalizeResult(next[idxInAll - 1].result) : null;
        if (prevRes === 'Won Point' || prevRes === 'Lost Point') {
          rally += 1;
        }
        for (let j = idxInAll; j < next.length; j++) {
          const res = j === idxInAll ? parsed : normalizeResult(next[j].result);
          const rallyForThisRow = rally;
          if (res === 'Won Point') our += 1;
          else if (res === 'Lost Point') opp += 1;
          next[j] = {
            ...next[j],
            our_score: our,
            opp_score: opp,
            [RALLY_FIELD]: rallyForThisRow,
          };
          if (res === 'Won Point' || res === 'Lost Point') {
            rally += 1;
          }
        }
        patchRowsRef.current = next.slice(idxInAll).map(r => ({
          id: r.id,
          our_score: r.our_score,
          opp_score: r.opp_score,
          [RALLY_FIELD]: r[RALLY_FIELD],
        }));
      } else if (field === 'our_score' || field === 'opp_score') {
        const editKey = field;
        const incOn = field === 'our_score' ? 'Won Point' : 'Lost Point';
        const prevOur = idxInAll > 0 ? Number(next[idxInAll - 1].our_score) || 0 : 0;
        const prevOpp = idxInAll > 0 ? Number(next[idxInAll - 1].opp_score) || 0 : 0;
        let editedVal = toNum(parsed) ?? 0;
        if (editKey === 'our_score') {
          next[idxInAll] = { ...next[idxInAll], our_score: editedVal };
        } else {
          next[idxInAll] = { ...next[idxInAll], opp_score: editedVal };
        }
        for (let j = idxInAll + 1; j < next.length; j++) {
          const res = normalizeResult(next[j].result);
          if (res === incOn) editedVal += 1;
          next[j] = {
            ...next[j],
            ...(editKey === 'our_score' ? { our_score: editedVal } : { opp_score: editedVal }),
          };
        }
        patchRowsRef.current = next.slice(idxInAll).map(r => ({
          id: r.id,
          [editKey]: r[editKey],
        }));
      } else if (field === 'set') {
        const setVal = toNum(parsed);
        next[idxInAll] = { ...next[idxInAll], set: setVal };
        for (let j = idxInAll + 1; j < next.length; j++) {
          next[j] = { ...next[j], set: setVal };
        }
        patchRowsRef.current = next.slice(idxInAll).map(r => ({
          id: r.id,
          set: r.set,
        }));
      }
      return next;
    });
    if (practiceMode) {
      return;
    }    
    const { error: updErr } = await supabase
      .from('stats')
      .update({ [field]: parsed })
      .eq('id', statId)
      .select('id')
      .maybeSingle();
    if (updErr) {
      setToast('Failed to update: ' + (updErr.message ?? ''));
      setStats(prev => {
        const next = [...prev];
        const i = next.findIndex(r => r.id === statId);
        if (i !== -1) next[i] = { ...next[i], [field]: value ?? null };
        return next;
      });
      return;
    }
    const patchRows = patchRowsRef.current || [];
    if (patchRows.length) {
      const batch = async (rows, size = 15) => {
        for (let i = 0; i < rows.length; i += size) {
          const chunk = rows.slice(i, i + size);
          await Promise.all(
            chunk.map(({ id, ...payload }) =>
              supabase.from('stats').update(payload).eq('id', id)
            )
          );
        }
      };
      await batch(patchRows);
    }
  };
  
  const handleBlur = async (e) => {
    if (!editing) return;
    if (e?.relatedTarget && wrapperRef.current?.contains(e.relatedTarget)) return;
    setTimeout(() => {
      setEditing(false);
      commitEdit(tempValue);
    }, 0);
  };

  const handleKeyDown = async (e) => {
    e.stopPropagation();
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      setTempValue(value ?? '');
      setEditing(false);
      return;
    }
    const suggestionNavKeys = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab'];
    const isNavigatingSuggestions =
      ['player', 'set_to_player', 'result', 'action_type', 'set_to_position']
        .includes(field) &&
      showSuggestions &&
      suggestionNavKeys.includes(key);
    if (isNavigatingSuggestions) {
      e.preventDefault();
      if (key === 'ArrowDown') {
        if (selectedSuggestionIndex >= suggestions.length - 1) {
          setEditing(false);
          setTempValue(value ?? '');
          if (setEditingCell) {
            setTimeout(() => {
              setEditingCell({ idx, field, direction: 'down' });
            }, 0);
          }
        } else {
          setInteractionMode('keyboard');
          setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        }
        return;
      }
      if (key === 'ArrowUp') {
        if (selectedSuggestionIndex <= 0) {
          setEditing(false);
          setTempValue(value ?? '');
          if (setEditingCell) {
            setTimeout(() => {
              setEditingCell({ idx, field, direction: 'up' });
            }, 0);
          }
        } else {
          setInteractionMode('keyboard');
          setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
        }
        return;
      }
      if ((key === 'Enter' || key === 'Tab') && showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        const selected = suggestions[selectedSuggestionIndex];
        setShowSuggestions(false);
        setTempValue(selected);
        setEditing(false);
        setTimeout(() => commitEdit(selected), 0);

        if (setEditingCell) {
          setTimeout(() => {
            setEditingCell({
              idx,
              field,
              direction: key === 'Tab' ? (e.shiftKey ? 'prev' : 'next') : (e.shiftKey ? 'up' : 'down'),
            });
          }, 0);
        }
        return;
      }
    }
    if (key === 'Enter' && e.altKey) {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newValue = tempValue.substring(0, start) + '\n' + tempValue.substring(end);
      setTempValue(newValue);

      requestAnimationFrame(() => {
        inputRef.current.selectionStart = inputRef.current.selectionEnd = start + 1;
      });
      return;
    }
    if (!e.shiftKey && !e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
      const { selectionStart, selectionEnd } = e.target;
      const cursorPos = selectionStart;
      const text = (tempValue ?? '').toString();    
      const isMultiline = text.includes('\n');
      const lines = text.split('\n');
      const lineIndex = text.slice(0, cursorPos).split('\n').length - 1;
      const lineOffset = cursorPos - text.split('\n').slice(0, lineIndex).join('\n').length - (lineIndex > 0 ? 1 : 0);
      const isCollapsed = selectionStart === selectionEnd;
      const isAtStart = isCollapsed && cursorPos === 0;
      const isAtEnd = isCollapsed && cursorPos === text.length;
      const direction =
        (key === 'ArrowLeft' && isAtStart) ? 'prev' :
        (key === 'ArrowRight' && isAtEnd) ? 'next' :
        (key === 'ArrowUp' && lineIndex === 0) ? 'up' :
        (key === 'ArrowDown' && lineIndex === lines.length - 1) ? 'down' :
        null;
      if (direction && setEditingCell) {
        e.preventDefault();
        handleBlur(); 
        setTimeout(() => {
          setEditingCell({ idx, field, direction });
        }, 0);
        return;
      }
    }    
    if (key === 'Enter' || key === 'Tab') {
      e.preventDefault();
      const direction = key === 'Tab'
        ? (e.shiftKey ? 'prev' : 'next')
        : (e.shiftKey ? 'up' : 'down');
      setEditing(false);
      setTimeout(() => commitEdit(tempValue), 0);
      if (setEditingCell) {
        setTimeout(() => {
          setEditingCell({ idx, field, direction });
        }, 0);
      }
      return;
    }
  };
  
  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    clickToEdit: () => {
      setEditing(true);
    },
    element: inputRef.current || wrapperRef.current
  }));
  
  useLayoutEffect(() => {
    if (!editing) return;
    measureGhost();
  }, [editing, tempValue]);
  
  useEffect(() => {
    if (!editing) return;
    let options = [];
    if (field === 'player' || field === 'set_to_player') {
      options = gamePlayers;
    } else if (field === 'result') {
      options = RESULT_OPTIONS;
    } else if (field === 'action_type') {
      options = ACTION_TYPE_OPTIONS;
    } else if (field === 'set_to_position') {  
      options = POSITION_OPTIONS;
    }
    const trimmedInput = (tempValue ?? '').toString().trim().toLowerCase();
    const filtered = trimmedInput.length > 0
      ? options.filter(opt => opt.toLowerCase().startsWith(trimmedInput))
      : [];
    setSuggestions(filtered.sort());
    setInteractionMode('keyboard');
    setSelectedSuggestionIndex(0);
    setShowSuggestions(filtered.length > 0);
  }, [editing, field, gamePlayers, tempValue]);
  useEffect(() => {
    setTempValue(value ?? '');
  }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.select();
    }
  }, [editing]);

  return (
    editing ? (
      <div ref={wrapperRef} className="relative w-full editable-cell-wrapper">
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          className="resize-none text-center bg-green-200"
          style={{
            height: cellHeight ? `${cellHeight}px` : '100%',
            width: cellWidth ? `${cellWidth}px` : '100%',
            display: 'block',
            verticalAlign: 'top',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            paddingTop: '0',
            paddingBottom: '0',
            paddingLeft: '0',
            paddingRight: '0',
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            margin: '0',
            border: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}   
           value={tempValue}
          onChange={(e) => {
            setTempValue(e.target.value);
            requestAnimationFrame(measureGhost);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {showSuggestions && (
          <ul
            className="absolute left-0 right-0 bg-white border border-gray-300 shadow z-10 max-h-40 overflow-y-auto text-sm"
            style={{ top: '100%' }}
            onMouseMove={(e) => {
              const listItems = Array.from(e.currentTarget.children);
              const hoverIndex = listItems.findIndex((li) =>
                li.contains(document.elementFromPoint(e.clientX, e.clientY))
              );
              if (hoverIndex !== -1) {
                setSelectedSuggestionIndex(hoverIndex);
                setInteractionMode('mouse');
              }
            }}
          >
          {suggestions.map((sug, i) => (
            <li
              key={i}
              className={`px-2 py-1 cursor-pointer ${
                i === selectedSuggestionIndex
                  ? 'bg-blue-100 text-black'
                  : interactionMode === 'mouse'
                    ? 'hover:bg-blue-100'
                    : ''
              }`}
              onMouseEnter={() => {
                if (interactionMode === 'mouse') {
                  setSelectedSuggestionIndex(i);
                }
              }}
              onMouseDown={async (e) => {
                e.preventDefault();
                setShowSuggestions(false);
                setTempValue(sug);
                await commitEdit(sug);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              {sug}
            </li>
          ))}
          </ul>
        )}      
        <div
          ref={ghostRef}
          aria-hidden
          className="invisible whitespace-pre-wrap break-words w-full"
          style={{
            fontSize: 'inherit',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            padding: 0,
            margin: 0,
          }}
        >     
        {(tempValue || ' ') + '\n'}      
      </div>
    </div>
    ) : (
      <div
        ref={wrapperRef}
        onClick={() => {
          if (displayRef.current) {
            const { offsetHeight, offsetWidth } = displayRef.current;
            setCellHeight(offsetHeight);
            setCellWidth(offsetWidth);
          }
          setEditing(true);
        }}
        className={`cursor-pointer w-full h-full flex items-center justify-center text-center ${highlightClass}`}
      >
        <div ref={displayRef} className="w-full text-center">
          {(value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) ? (
            <span className="text-gray-400 italic">–</span>
          ) : (
            value
          )}
        </div>
      </div>
    )
  );

});

export default EditableCell;
