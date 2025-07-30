import React, { useState, useRef, useEffect, useLayoutEffect  } from 'react';

const TEXT_OPERATORS = [
  { label: "Contains", value: "contains" },
  { label: "Does not contain", value: "not_contains" },
  { label: "Equals", value: "equals" },
  { label: "Does not equal", value: "not_equals" },
  { label: "Begins with", value: "starts_with" },
  { label: "Ends with", value: "ends_with" },
  { label: "Blank", value: "blank" },
  { label: "Not blank", value: "not_blank" },
];
const NUMERIC_OPERATORS = [
  { label: "Equals", value: "equals" },
  { label: "Does not equal", value: "not_equals" },
  { label: "Greater than", value: "gt" },
  { label: "Greater than or equal to", value: "gte" },
  { label: "Less than", value: "lt" },
  { label: "Less than or equal to", value: "lte" },
  { label: "Between", value: "between" },
  { label: "Blank", value: "blank" },
  { label: "Not blank", value: "not_blank" },
];
const SortableFilterHeader = ({
  columnKey,
  label,
  sortConfig,
  onSortChange,
  columnType,
  filterValue,
  onFilterChange,
  isFilterable = true,
}) => {
  const firstInputRef = useRef(null);
  const isFilterableType = (type) =>
  ['text', 'numeric', 'int', 'int2', 'int4', 'int8', 'float', 'float4', 'float8'].includes(type);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  useEffect(() => {
    if (showFilterMenu && firstInputRef.current) {
      firstInputRef.current.focus();
      firstInputRef.current.select?.();
    }
  }, [showFilterMenu]);    
  const wrapperRef = useRef(null);
  const defaultOperator = isFilterableType(columnType) && columnType !== 'text' ? 'equals' : 'contains';
  const effectiveFilter = filterValue || {
    conditions: [
      {
        operator: defaultOperator,
        value: ''
      }
    ]
  };
  useLayoutEffect(() => {
    if (showFilterMenu && wrapperRef.current) {
    const raf = requestAnimationFrame(() => {
      setMenuStyles(calculateMenuPosition());
    });
    return () => cancelAnimationFrame(raf);
    }
  }, [showFilterMenu]);
  
  const isFilterActive = () =>
    effectiveFilter.conditions.some(({ operator, value }) => {
      if (['blank', 'not_blank'].includes(operator)) return true;
      if (operator === 'between') {
        return value?.min?.toString().trim() !== '' || value?.max?.toString().trim() !== '';
      }
      return value?.toString().trim() !== '';
    }); 
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(event.target) && !event.target.closest('button')
      ) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  useEffect(() => {
    const handleCloseAll = () => setShowFilterMenu(false);
    window.addEventListener('closeAllFilters', handleCloseAll);
    return () => window.removeEventListener('closeAllFilters', handleCloseAll);
  }, []);  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showFilterMenu) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowFilterMenu(false);
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        setShowFilterMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFilterMenu]);  
  const toggleSort = () => {
    onSortChange((prev) => {
      if (prev.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { key: 'import_seq', direction: 'asc' };
      }
      return { key: columnKey, direction: 'asc' };
    });
  };

  const isSorted = sortConfig.key === columnKey;

  const updateCondition = (idx, key, val) => {
    const updatedConditions = [...effectiveFilter.conditions];
    updatedConditions[idx] = { ...updatedConditions[idx], [key]: val };
    onFilterChange(columnKey, {
      ...effectiveFilter,
      conditions: updatedConditions
    });
  };
  const addCondition = () => {
    if (effectiveFilter.conditions.length >= 10) return;
    const operator = columnType === 'text' ? 'contains' : 'equals';
    const newConditions = [
      ...effectiveFilter.conditions,
      { logic: 'AND', operator, value: '' }
    ];
    onFilterChange(columnKey, {
      ...effectiveFilter,
      conditions: newConditions
    });
    setTimeout(() => {
      if (wrapperRef.current) {
        const inputs = wrapperRef.current.querySelectorAll('input[type="number"], input[type="text"]');
        const lastInput = inputs[inputs.length - 1];
        lastInput?.focus();
        lastInput?.select?.();
      }
    }, 0);
  };
  const removeCondition = (idx) => {
    const newConditions = effectiveFilter.conditions.filter((_, i) => i !== idx);
    onFilterChange(columnKey, {
      ...effectiveFilter,
      conditions: newConditions.length ? newConditions : [{ operator: 'contains', value: '' }]
    });
  };
  const [menuStyles, setMenuStyles] = useState({});
  const calculateMenuPosition = () => {
    const menuWidth = wrapperRef.current?.parentElement?.parentElement?.offsetWidth;
    const rect = wrapperRef.current.getBoundingClientRect();
    const overflowRight = rect.right > menuWidth;

    return {
      left: overflowRight ? 'auto' : '0',
      right: '0',
      top: '100%',
      bottom: 'auto',
    };
  };
  useLayoutEffect(() => {
    if (showFilterMenu && wrapperRef.current) {
      setMenuStyles(calculateMenuPosition());
    }
  }, [showFilterMenu]);
  
  return (
    <th className="relative align-top px-2 py-1 text-center text-sm font-medium text-gray-800 border border-black bg-gray-200">
      <div className="flex justify-between items-start gap-1">
        <button onClick={toggleSort} className="cursor-pointer flex-1 text-center ">
          {label}
          {isSorted && (
            <span className="ml-1 text-xs">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
          )}
        </button>
        {isFilterable && isFilterableType(columnType) && (
          <button
            onClick={() => {
              const shouldOpen = !showFilterMenu;
              window.dispatchEvent(new Event('closeAllFilters'));
              setShowFilterMenu(shouldOpen);
            }}
            className={`relative p-1 rounded transition-colors
              ${isFilterActive() ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700': 'text-gray-500 hover:text-black hover:bg-gray-300'}`}
            title="Filter"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 4h18M6 10h12M10 16h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {isFilterActive() && (
              <span className="absolute top-[2px] right-[2px] w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
          </button>
        )}
      </div>

      {showFilterMenu && isFilterableType(columnType) && (
        <div
          ref={wrapperRef}
          className="absolute z-10 mt-2 bg-white border border-gray-300 shadow-md p-2 rounded w-56 right-0 space-y-2 max-h-96 overflow-y-auto"
          style={menuStyles}
        >
          {effectiveFilter.conditions.map((condition, idx) => {
            const OPERATORS = columnType === 'text' ? TEXT_OPERATORS : NUMERIC_OPERATORS;
            return (
              <div key={idx} className="space-y-1 pt-1 border-t border-gray-200">
                {idx > 0 && (
                  <div className="flex justify-center gap-4 pb-1">
                    {['AND', 'OR'].map((logic) => (
                      <label key={logic} className="inline-flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          name={`logic-${columnKey}-${idx}`} // Unique per condition
                          checked={condition.logic === logic}
                          onChange={() => updateCondition(idx, 'logic', logic)}
                        />
                        {logic}
                      </label>
                    ))}
                  </div>
                )}
                <select
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                  value={condition.operator}
                  onChange={(e) => {
                    updateCondition(idx, 'operator', e.target.value);
                    setTimeout(() => {
                      if (idx === 0 && firstInputRef.current) {
                        firstInputRef.current.focus();
                        firstInputRef.current.select?.();
                      }
                    }, 0);
                  }}
                >
                  {OPERATORS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {!['blank', 'not_blank'].includes(condition.operator) && (
                  <>
                    {condition.operator === 'between' ? (
                      <div className="flex gap-1">
                        <input
                          ref={idx === 0 ? firstInputRef : null}
                          type="number"
                          className="w-1/2 border border-gray-300 rounded px-2 py-1 text-sm"
                          value={condition.value?.min ?? ''}
                          placeholder="Min"
                          onChange={(e) =>
                            updateCondition(idx, 'value', {
                              ...condition.value,
                              min: e.target.value
                            })
                          }
                        />
                        <input
                          type="number"
                          className="w-1/2 border border-gray-300 rounded px-2 py-1 text-sm"
                          value={condition.value?.max ?? ''}
                          placeholder="Max"
                          onChange={(e) =>
                            updateCondition(idx, 'value', {
                              ...condition.value,
                              max: e.target.value
                            })
                          }
                        />
                      </div>
                    ) : (
                      <input
                        ref={idx === 0 ? firstInputRef : null}
                        type={columnType === 'text' ? 'text' : 'number'}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        value={condition.value ?? ''}
                        placeholder="Filter value"
                        onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                      />
                    )}
                  </>
                )}
                {effectiveFilter.conditions.length > 1 && (
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => removeCondition(idx)}
                  >
                    Remove
                  </button>
                )}
              </div>
             )
          })}
          {effectiveFilter.conditions.length < 10 && (
            <button
              onClick={addCondition}
              className="w-full text-sm text-blue-600 hover:underline mt-2"
            >
              + Add Condition
            </button>
          )}
          <button
            onClick={() => {
              onFilterChange(columnKey, null);
              setShowFilterMenu(false); // 👈 closes the popup
            }}
            className="mt-2 w-full text-xs text-gray-600 hover:text-red-600"
          >
            Clear Filter
          </button>
        </div>
      )}
    </th>
  );
};

export default SortableFilterHeader;
