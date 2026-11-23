import { useState, type ReactNode } from 'react';

/** The seat's measurements: three key rows by default so the view stays visible, the rest on demand. */
export function Measures({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <table className={open ? 'measures is-open' : 'measures'}>
        <tbody>{children}</tbody>
      </table>
      <button type="button" className="measures__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Fewer measurements' : 'All measurements'}
      </button>
    </>
  );
}
