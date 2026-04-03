import React from 'react';

export interface ContextMenuAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, actions, onClose }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x, y });

  React.useLayoutEffect(() => {
    if (!menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    setPos({
      x: x + width > window.innerWidth ? Math.max(0, x - width) : x,
      y: y + height > window.innerHeight ? Math.max(0, y - height) : y,
    });
  }, [x, y]);

  React.useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('contextmenu', close);
      document.addEventListener('keydown', key);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
      style={{ top: pos.y, left: pos.x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {actions.map((action, i) => (
        <React.Fragment key={i}>
          {action.divider && <div className="my-1 border-t border-gray-100" />}
          <button
            onClick={() => { action.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
              action.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {action.icon && (
              <span className="flex-shrink-0 w-4 flex items-center justify-center">
                {action.icon}
              </span>
            )}
            {action.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
