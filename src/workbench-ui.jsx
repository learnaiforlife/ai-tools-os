import React, { useEffect, useRef, useId } from 'react';
export function Button({ children, primary, ...props }) { return <button className={'wb-button' + (primary ? ' primary' : '')} type="button" {...props}>{children}</button>; }
export function Notice({ children, error = false }) { return <div className={'wb-notice' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>{children}</div>; }
export function Field({ label, children }) { return <label className="wb-field"><span>{label}</span>{children}</label>; }
export function Dialog({ title, close, children, wide = false }) {
  const titleId = useId();
  const ref = useRef(null), closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement, el = ref.current; el.showModal();
    const cancel = event => { event.preventDefault(); closeRef.current(); }; el.addEventListener('cancel', cancel);
    return () => { el.removeEventListener('cancel', cancel); el.close(); previous?.focus?.(); };
  }, []);
  return <dialog className={'wb-dialog' + (wide ? ' wide' : '')} ref={ref} aria-labelledby={titleId}><header><h2 id={titleId}>{title}</h2><Button aria-label="Close dialog" onClick={close}>Close</Button></header>{children}</dialog>;
}
