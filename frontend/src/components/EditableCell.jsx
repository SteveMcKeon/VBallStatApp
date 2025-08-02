import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle  } from 'react';
import EditMode from './EditMode';

const EditableCell = forwardRef(({ value, type, statId, field, idx, stats, setStats, gamePlayers, setEditingCell }, ref) => {
  const RESULT_OPTIONS = ['In Play', 'Won Point', 'Lost Point'];
  const ACTION_TYPE_OPTIONS = [
    'Serve', 'Pass', 'Set', 'Tip', 'Hit', 'Block', 'Dig', 'Free', 'Taylor Dump'
  ];  
  const [interactionMode, setInteractionMode] = useState('keyboard'); // 'keyboard' | 'mouse'
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value ?? '');
  const inputRef = useRef(null);
  const wrapperRef = useRef(null); 
  const { authorizedFetch } = EditMode();
  const [cellHeight, setCellHeight] = useState(null);
  const [cellWidth, setCellWidth] = useState(null);  
  const displayRef = useRef(null);
  const ghostRef = useRef(null);
  
  useEffect(() => {
    if (!editing) return;

    let options = [];
    if (field === 'player') {
      options = gamePlayers;
    } else if (field === 'result') {
      options = RESULT_OPTIONS;
    } else if (field === 'action_type') {
      options = ACTION_TYPE_OPTIONS;
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

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    clickToEdit: () => {
      wrapperRef.current?.click();
    },
    element: inputRef.current || wrapperRef.current
  }));
  
  const handleBlur = async () => {
    if (!editing) return;

    let parsed;
    const isBlank =
      ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(type)
        ? tempValue.trim?.() === ''
        : tempValue === '';
    if (['int2', 'int4', 'int8'].includes(type)) {
      parsed = isBlank ? null : parseInt(tempValue);
    } else if (['float4', 'float8', 'numeric'].includes(type)) {
      parsed = isBlank ? null : parseFloat(tempValue);
    } else {
      parsed = isBlank ? null : tempValue;
    }
    if ((field === 'player' || field === 'result' || field === 'action_type') && suggestions.length === 1) {
      parsed = suggestions[0];
      setTempValue(suggestions[0]);
    }
    const isValid =
      (['int2', 'int4', 'int8'].includes(type) && (parsed === null || (!isNaN(parsed) && Number.isInteger(parsed)))) ||
      (['float4', 'float8', 'numeric'].includes(type) && (parsed === null || !isNaN(parsed))) ||
      (type === 'text' && (typeof parsed === 'string' || parsed === null));
    if (!isValid) {
      alert(`Invalid value for type ${type}`);
      setTempValue(value ?? '');
      setEditing(false);
      return;
    }
    
    if ((value ?? '') === (parsed ?? '')) {
      setEditing(false);
      return;
    }
    try {
      const res = await authorizedFetch('/api/update-stat', {
        body: { statId, updates: { [field]: parsed } },
      });
      const result = await res.json();

      if (result.success) {
        const statIndex = stats.findIndex(row => row.id === statId);
        if (statIndex !== -1) {
          const newStats = stats.map((row, i) => 
            i === statIndex ? { ...row, [field]: parsed } : row
          );
          if (field === 'result' && (parsed === 'Point Won' || parsed === 'Point Lost')) {
            const isWon = parsed === 'Point Won';
            const updatedScore = isWon
              ? { our_score: (newStats[statIndex].our_score ?? 0) + 1 }
              : { opp_score: (newStats[statIndex].opp_score ?? 0) + 1 };

            newStats[statIndex] = { ...newStats[statIndex], ...updatedScore };

            for (let i = statIndex + 1; i < newStats.length; i++) {
              newStats[i] = {
                ...newStats[i],
                posession_seq: i === statIndex + 1 ? 1 : newStats[i - 1].posession_seq + 1,
                our_score: newStats[i - 1].our_score,
                opp_score: newStats[i - 1].opp_score,
              };
            }

            await authorizedFetch('/api/save-stats', {
              body: { rows: newStats.slice(statIndex) },
            });
          }

          setStats(newStats);
          setTimeout(() => setEditing(false), 0);
          return;          
        } else {
          alert('Stat not found by id.');
          setTempValue(value ?? '');
        }
      } else {
        alert('Failed to update: ' + result.message);
        setTempValue(value ?? '');
      }
    } catch (err) {
      console.error('Error during update:', err);
      setTempValue(value ?? '');
    }

    setEditing(false);
  };

  const handleKeyDown = (e) => {
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      setTempValue(value ?? '');
      setEditing(false);
      return;
    }
    const suggestionNavKeys = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab'];
    const isNavigatingSuggestions = ['player', 'result', 'action_type'].includes(field) && showSuggestions && suggestionNavKeys.includes(key);
    if (isNavigatingSuggestions) {
      e.preventDefault();
      if (key === 'ArrowDown') {
        setInteractionMode('keyboard');
        setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (key === 'ArrowUp') {
        setInteractionMode('keyboard');
        setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if ((key === 'Enter' || key === 'Tab') && suggestions.length > 0) {
        setTempValue(suggestions[selectedSuggestionIndex]);
        setShowSuggestions(false);

        handleBlur().then(() => {
          if (setEditingCell) {
            setEditingCell({
              idx,
              field,
              direction: key === 'Tab'
                ? (e.shiftKey ? 'prev' : 'next')
                : (e.shiftKey ? 'up' : 'down'),
            });
          }
        });
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
        handleBlur().then(() => {
          setEditingCell({ idx, field, direction });
        });
        return;
      }
    }    
    if (key === 'Enter' || key === 'Tab') {
      e.preventDefault();

      const direction = key === 'Tab'
        ? (e.shiftKey ? 'prev' : 'next')
        : (e.shiftKey ? 'up' : 'down');
      handleBlur().then(() => {
        if (setEditingCell) {
          setEditingCell({ idx, field, direction });
        }
      });
      return;
    }
  };

  return (
    editing ? (
      <div ref={wrapperRef} className="relative w-full h-full editable-cell-wrapper">
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          className="resize-none text-center bg-yellow-200"
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
              onMouseDown={() => {
                setTempValue(sug);
                setShowSuggestions(false);
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
        className="cursor-pointer hover:bg-gray-100 w-full h-full flex items-center justify-center"
      >
        {(value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) ? (
          <span className="text-gray-400 italic">–</span>
        ) : (
          value
        )}
      </div>
    )
  );

});

export default EditableCell;
