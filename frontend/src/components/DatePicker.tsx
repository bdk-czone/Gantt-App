import React from 'react';
import { formatCompactDate } from '../lib/dateFormat';

interface DatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  placeholder?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'Set date' }) => {
  const [editing, setEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.showPicker?.(), 50);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value || null);
    setEditing(false);
  };

  const handleBlur = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={value || ''}
        onChange={handleChange}
        onBlur={handleBlur}
        className="text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 w-32"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-left hover:text-blue-600 transition-colors"
    >
      {value ? (
        <span className="text-gray-700">{formatCompactDate(value)}</span>
      ) : (
        <span className="text-gray-400 hover:text-blue-400">{placeholder}</span>
      )}
    </button>
  );
};

export default DatePicker;
