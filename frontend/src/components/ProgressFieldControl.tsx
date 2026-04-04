import React from 'react';
import { parseProgressInput } from '../lib/progress';

interface ProgressBadgeProps {
  value: number | null;
  compact?: boolean;
  emptyLabel?: string;
}

interface ProgressFieldControlProps {
  value: string;
  onValueChange: (value: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  compact?: boolean;
  emptyLabel?: string;
  autoFocusInput?: boolean;
}

interface InteractiveProgressBarProps {
  value: number | null;
  editable?: boolean;
  onCommit?: (value: number) => void;
  compact?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
}

function clampProgressValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const ProgressBadge: React.FC<ProgressBadgeProps> = ({ value, compact = false, emptyLabel = 'Set' }) => {
  const hasValue = typeof value === 'number' && !Number.isNaN(value);
  const progress = hasValue ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <span className={compact ? 'flex min-w-0 items-center gap-2' : 'flex min-w-0 items-center gap-3'}>
      <span
        className={`relative min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/85 ring-1 ring-slate-200/80 shadow-inner ${
          compact ? 'h-2.5' : 'h-3'
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-[width] duration-300 ${
            hasValue ? 'from-sky-500 via-blue-500 to-indigo-500' : 'from-slate-300 to-slate-300'
          }`}
          style={{ width: `${progress}%` }}
        />
        {hasValue && progress > 0 ? (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-white/25"
            style={{ width: `${progress}%` }}
          />
        ) : null}
      </span>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold tracking-[0.01em] ${
          compact ? 'text-[10px]' : 'text-[11px]'
        } ${
          hasValue
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-400'
        }`}
      >
        {hasValue ? `${progress}%` : emptyLabel}
      </span>
    </span>
  );
};

export const InteractiveProgressBar: React.FC<InteractiveProgressBarProps> = ({
  value,
  editable = false,
  onCommit,
  compact = false,
  emptyLabel = 'Set',
  ariaLabel = 'Progress',
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [draftValue, setDraftValue] = React.useState<number | null>(value);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!dragging) {
      setDraftValue(value);
    }
  }, [dragging, value]);

  const resolveValueFromClientX = React.useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return clampProgressValue(draftValue ?? value ?? 0);
      }
      const ratio = (clientX - rect.left) / rect.width;
      return clampProgressValue(ratio * 100);
    },
    [draftValue, value]
  );

  React.useEffect(() => {
    if (!dragging || !editable) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDraftValue(resolveValueFromClientX(event.clientX));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const nextValue = resolveValueFromClientX(event.clientX);
      setDraftValue(nextValue);
      setDragging(false);
      onCommit?.(nextValue);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, editable, onCommit, resolveValueFromClientX]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    const nextValue = resolveValueFromClientX(event.clientX);
    setDraftValue(nextValue);
    setDragging(true);
    event.currentTarget.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editable) return;

    let nextValue: number | null = null;
    const currentValue = draftValue ?? value ?? 0;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextValue = clampProgressValue(currentValue - 5);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextValue = clampProgressValue(currentValue + 5);
    } else if (event.key === 'Home') {
      nextValue = 0;
    } else if (event.key === 'End') {
      nextValue = 100;
    }

    if (nextValue === null) return;

    event.preventDefault();
    event.stopPropagation();
    setDraftValue(nextValue);
    onCommit?.(nextValue);
  };

  const hasValue = typeof draftValue === 'number' && !Number.isNaN(draftValue);
  const progress = hasValue ? clampProgressValue(draftValue) : 0;

  return (
    <div
      className={compact ? 'flex min-w-0 items-center gap-2' : 'flex min-w-0 items-center gap-3'}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={trackRef}
        role={editable ? 'slider' : undefined}
        tabIndex={editable ? 0 : -1}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasValue ? progress : 0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className={`group relative min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/85 ring-1 ring-slate-200/80 shadow-inner transition-all ${
          compact ? 'h-2.5' : 'h-3'
        } ${editable ? 'cursor-ew-resize outline-none hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-400' : ''}`}
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-[width] duration-200 ${
            hasValue ? 'from-sky-500 via-blue-500 to-indigo-500' : 'from-slate-300 to-slate-300'
          }`}
          style={{ width: `${progress}%` }}
        />
        {hasValue && progress > 0 ? (
          <span className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${progress}%` }} />
        ) : null}
        {editable ? (
          <span
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600 shadow transition-opacity ${
              dragging || progress > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
            }`}
            style={{ left: `${progress}%` }}
          />
        ) : null}
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold tracking-[0.01em] ${
          compact ? 'text-[10px]' : 'text-[11px]'
        } ${
          hasValue
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-slate-200 bg-white text-slate-400'
        }`}
      >
        {hasValue ? `${progress}%` : emptyLabel}
      </span>
    </div>
  );
};

export const ProgressFieldControl: React.FC<ProgressFieldControlProps> = ({
  value,
  onValueChange,
  onCommit,
  onCancel,
  inputRef,
  compact = false,
  emptyLabel = 'Set',
  autoFocusInput = false,
}) => {
  const parsedValue = parseProgressInput(value);
  const numericValue = parsedValue ?? 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onCommit?.();
    }
    if (event.key === 'Escape') {
      onCancel?.();
    }
  };

  return (
    <div
      className={`min-w-0 rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm ${compact ? 'p-2' : 'p-3'}`}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ProgressBadge value={parsedValue} compact={compact} emptyLabel={emptyLabel} />
      <div className={`flex items-center gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={numericValue}
          onChange={(event) => onValueChange(event.target.value)}
          onPointerUp={() => onCommit?.()}
          onKeyUp={(event) => {
            if (event.key === 'Enter') {
              onCommit?.();
            }
          }}
          className="min-w-0 flex-1 cursor-pointer accent-blue-600"
        />
        <div className={`relative shrink-0 ${compact ? 'w-[4.35rem]' : 'w-20'}`}>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onBlur={() => onCommit?.()}
            onKeyDown={handleKeyDown}
            className={`w-full rounded-xl border border-slate-300 bg-white pr-5 text-xs outline-none transition-colors focus:border-blue-500 ${
              compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
            }`}
            placeholder="0"
            autoFocus={autoFocusInput}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
            %
          </span>
        </div>
      </div>
    </div>
  );
};
