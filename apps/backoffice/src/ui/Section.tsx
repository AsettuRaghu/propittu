import { useState, type ReactNode } from 'react';

/** A titled part of a detail pane that can be folded away. */
export function Section({
  title,
  count,
  open: initial = true,
  aside,
  children,
}: {
  title: string;
  count?: number;
  open?: boolean;
  /** Small text or a control on the right of the heading. */
  aside?: ReactNode;
  children: ReactNode | ((open: boolean) => ReactNode);
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`fold ${open ? 'open' : ''}`}>
      <header>
        <button className="fold-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="chev" aria-hidden>
            ▸
          </span>
          {title}
          {count !== undefined ? <span className="fold-count">{count}</span> : null}
        </button>
        {aside ? <div className="fold-aside">{aside}</div> : null}
      </header>
      {open ? (
        <div className="fold-body">
          {typeof children === 'function' ? children(open) : children}
        </div>
      ) : null}
    </section>
  );
}
