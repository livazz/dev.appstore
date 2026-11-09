import { useEffect, type ReactNode } from 'react';
import { IconClose } from './Icons';

export function Modal({ children, onClose, wide, label }: { children: ReactNode; onClose: () => void; wide?: boolean; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={label}>
        <button className="modal-x" onClick={onClose} aria-label="Fermer">
          <IconClose size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
