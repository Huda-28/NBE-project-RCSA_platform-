import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface HoverTooltipProps {
  title?: string;
  description: string;
  side?: TooltipSide;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * Portal-based RTL-safe Hover & Focus Tooltip.
 * Never clips inside overflow-hidden containers, tables, or sidebars,
 * and clamps itself cleanly within the viewport.
 */
export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  title,
  description,
  side = 'top',
  className = 'inline-flex',
  children,
  disabled = false,
}) => {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; resolvedSide: TooltipSide } | null>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    const estWidth = 260;
    const estHeight = title ? 74 : 52;

    let resolvedSide = side;
    if (side === 'top' && rect.top < estHeight + 16) resolvedSide = 'bottom';
    if (side === 'bottom' && window.innerHeight - rect.bottom < estHeight + 16) resolvedSide = 'top';
    if (side === 'left' && rect.left < estWidth + 16) resolvedSide = 'bottom';
    if (side === 'right' && window.innerWidth - rect.right < estWidth + 16) resolvedSide = 'bottom';

    let top = rect.top - gap;
    let left = rect.left + rect.width / 2;

    if (resolvedSide === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2;
    } else if (resolvedSide === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - gap;
    } else if (resolvedSide === 'right') {
      top = rect.top + rect.height / 2;
      left = rect.right + gap;
    }

    // Clamp horizontally for top/bottom placements
    if (resolvedSide === 'top' || resolvedSide === 'bottom') {
      const half = estWidth / 2;
      left = Math.max(half + 12, Math.min(window.innerWidth - half - 12, left));
    }

    setCoords({ top, left, resolvedSide });
  }, [side, title]);

  const show = useCallback(() => {
    if (disabled || !description) return;
    updatePosition();
    setVisible(true);
  }, [disabled, description, updatePosition]);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onScrollOrResize = () => setVisible(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible]);

  const getTransform = (resolvedSide: TooltipSide) => {
    switch (resolvedSide) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
    }
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={className}
      >
        {children}
      </span>

      {visible &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            dir="rtl"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: getTransform(coords.resolvedSide),
            }}
            className="pointer-events-none z-[9999] max-w-[270px] w-max px-3 py-2 rounded-xl bg-[#09331F] text-white border border-[#F79C1E]/45 shadow-xl text-right font-['Cairo'] animate-in fade-in duration-100"
          >
            {title && (
              <div className="text-[11px] font-extrabold text-[#F79C1E] mb-0.5 leading-snug">
                {title}
              </div>
            )}
            <div className="text-[11px] font-medium text-slate-100 leading-relaxed">
              {description}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

interface InfoHintProps {
  title?: string;
  description: string;
  side?: TooltipSide;
  ariaLabel?: string;
}

/**
 * Quiet `?` hover badge to replace cluttered inline explanatory paragraphs.
 */
export const InfoHint: React.FC<InfoHintProps> = ({
  title,
  description,
  side = 'top',
  ariaLabel,
}) => (
  <HoverTooltip title={title} description={description} side={side}>
    <button
      type="button"
      tabIndex={0}
      aria-label={ariaLabel || title || 'توضيح'}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[#006547] focus-visible:text-[#006547] focus-visible:outline-none transition-colors cursor-help shrink-0"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  </HoverTooltip>
);
