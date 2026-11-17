// src/components/ui/Modal.jsx
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Accessible dialog wrapper that traps Tab focus inside the topmost modal,
 * closes cleanly on Escape, and restores focus to the trigger on unmount.
 */
export function Modal({
  titleId,
  onClose,
  backdropClassName = 'modal-backdrop',
  panelClassName = 'modal-panel',
  closeOnBackdrop = false,
  children,
}) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const panel = panelRef.current;

    if (panel && !panel.contains(document.activeElement)) {
      const focusables = panel.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    }

    const isTopmostModal = () => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      return dialogs.length === 0 || dialogs[dialogs.length - 1] === backdropRef.current;
    };

    const handleKeyDown = (event) => {
      if (!isTopmostModal()) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key === 'Tab' && panel) {
        const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !panel.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function' && prev.isConnected) {
        prev.focus();
      }
    };
  }, []);

  const handleBackdropMouseDown = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onCloseRef.current?.();
    }
  };

  return (
    <div
      ref={backdropRef}
      className={backdropClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={panelClassName} ref={panelRef} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
