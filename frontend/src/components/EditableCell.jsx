import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle  } from 'react';
import EditMode from './EditMode';

const EditableCell = forwardRef(({ value, type, statId, field, idx, stats, setStats, setEditingCell }, ref) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value ?? ' ');
  const inputRef = useRef(null);
  const wrapperRef = useRef(null); 
  const { authorizedFetch } = EditMode();
  const [cellHeight, setCellHeight] = useState(null);
  const [cellWidth, setCellWidth] = useState(null);  
  const displayRef = useRef(null);
  const ghostRef = useRef(null);
  
  useEffect(() => {
    if (editing && inputRef.current && ghostRef.current) {
      inputRef.current.style.height = ghostRef.current.offsetHeight + 'px';
    }
  }, [tempValue, editing]);
    
  useEffect(() => {
    setTempValue(value ?? ' ');
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

    if (value !== null && parsed === value) {
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
          const newStats = [...stats];
          newStats[statIndex] = { ...newStats[statIndex], [field]: parsed };

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
    if (e.key === 'Escape') {
      e.preventDefault();
      setTempValue(value ?? ''); 
      setEditing(false);         
      return;
    } else if (e.key === 'Enter') {
      if (e.altKey) {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const newValue =
          tempValue.substring(0, start) + '\n' + tempValue.substring(end);
        setTempValue(newValue);

        requestAnimationFrame(() => {
          inputRef.current.selectionStart = inputRef.current.selectionEnd = start + 1;
        });
        return;
      }

      e.preventDefault();
      handleBlur().then(() => {
        if (setEditingCell) {
          setEditingCell({
            idx,
            field,
            direction: e.shiftKey ? 'up' : 'down'
          });
        }
      });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleBlur().then(() => {
        if (setEditingCell) {
          setEditingCell({
            idx,
            field,
            direction: e.shiftKey ? 'prev' : 'next'
          });
        }
      });
    }
  };

  return (
    editing ? (
      <div ref={wrapperRef} className="relative w-full h-full">
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
        className="cursor-pointer hover:bg-gray-100"
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
