import React from 'react';

interface HoverInfoProps {
  text: string;
  children: React.ReactNode;
}

const HoverInfo: React.FC<HoverInfoProps> = ({ text, children }) => (
  <div className="group relative inline-flex">
    {children}
    <div className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg group-hover:block">
      {text}
    </div>
  </div>
);

export default HoverInfo;
