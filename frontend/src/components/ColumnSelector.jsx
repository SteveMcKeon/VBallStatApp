import { useState, useRef, useEffect } from 'react';

const ColumnSelector = ({ columns, visibleColumns, toggleColumn }) => {
  const [open, setOpen] = useState(false);
  const selectorRef = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={selectorRef}>
      <button
        type="button"
        className="w-full border p-2 text-left bg-gray-100 rounded"
        onClick={() => setOpen(!open)}
      >
        {columns
          .filter(c => visibleColumns[c.key]?.visible)
          .map(c => c.label)
          .join(', ') || 'None Selected'}
      </button>
      {open && (
        <div className="absolute z-10 bg-gray-100 border rounded shadow-md mt-1 w-full max-h-60 overflow-y-auto p-2 space-y-1">
          {columns.map(({ key, label, disabled }) => (
            <label
              key={key}
              className={`flex items-center space-x-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={visibleColumns[key]?.visible || false}
                onChange={() => {
                  if (!disabled) toggleColumn(key);
                }}
                disabled={disabled}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default ColumnSelector;
