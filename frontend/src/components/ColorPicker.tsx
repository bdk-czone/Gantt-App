import React from 'react';
import { Check } from 'lucide-react';
import { COLOR_OPTIONS } from '../lib/appearance';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {COLOR_OPTIONS.map((color) => {
      const selected = value === color;
      return (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 ${
            selected ? 'border-slate-900' : 'border-white shadow-sm'
          }`}
          style={{ backgroundColor: color }}
          title={color}
        >
          {selected && <Check size={14} className="text-white drop-shadow-sm" />}
        </button>
      );
    })}
  </div>
);

export default ColorPicker;
