import { useEffect, useRef, type ReactNode } from 'react';

export default function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog className="dialog" ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="button button-quiet" type="button" onClick={onClose} aria-label="Close dialog">✕</button></div>
    {children}
  </dialog>;
}
