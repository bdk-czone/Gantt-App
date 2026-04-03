import React from 'react';
import { ICON_OPTIONS } from '../lib/appearance';

interface IconPickerProps {
  value: string;
  color: string;
  onChange: (value: string) => void;
}

const IconPicker: React.FC<IconPickerProps> = ({ value, color, onChange }) => (
  <div className="grid grid-cols-5 gap-2">
    {ICON_OPTIONS.map(({ value: iconValue, label, Icon }) => {
      const selected = value === iconValue;
      return (
        <button
          key={iconValue}
          type="button"
          onClick={() => onChange(iconValue)}
          className={`flex h-11 items-center justify-center rounded-xl border text-xs transition-colors ${
            selected
              ? 'border-slate-900 bg-slate-100'
              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
          }`}
          title={label}
        >
          <Icon size={16} color={color} />
        </button>
      );
    })}
  </div>
);

export default IconPicker;
