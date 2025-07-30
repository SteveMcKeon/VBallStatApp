import React, { useState, useRef, useEffect } from 'react';
import EditMode from './EditMode';

const EditableCell = ({ value, type, statId, field, idx, stats, setStats }) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value ?? ' ');
  const inputRef = useRef(null);
  const { authorizedFetch } = EditMode();

  const handleBlur = async () => {
    if (!editing) return;

    let parsed;
    const isBlank = tempValue.trim?.() === '';

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

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  return editing ? (
    <input
      ref={inputRef}
      autoFocus
      size="1"
      className="w-full text-center bg-yellow-200"
      value={tempValue}
      onChange={(e) => setTempValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleBlur();
        if (e.key === 'Escape') {
          setEditing(false);
          setTempValue(value ?? '');
        }
      }}
    />
  ) : (
    <div onClick={() => setEditing(true)} className="cursor-pointer hover:bg-gray-100">
      {(value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) ? (
        <span className="text-gray-400 italic">–</span>
      ) : (
        value
      )}
    </div>
  );
};

export default EditableCell;
