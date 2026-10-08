import { useState, type ReactNode } from 'react';

/**
 * Put things in order by dragging (or with the arrow buttons), then Save.
 * Used for services, categories and plans — the order customers see.
 */
export function Reorder<T>({
  items,
  itemKey,
  render,
  onSave,
  onCancel,
  busy,
}: {
  items: T[];
  itemKey: (item: T) => string;
  render: (item: T) => ReactNode;
  onSave: (keys: string[]) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [list, setList] = useState(items);
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    setList(next);
  };
  return (
    <div className="reorder">
      <p className="sub">
        Drag a row (or use the arrows) into the order customers should see, then save.
      </p>
      <ol>
        {list.map((it, i) => (
          <li
            key={itemKey(it)}
            draggable
            className={dragging === i ? 'dragging' : ''}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== i) {
                move(dragging, i);
                setDragging(i);
              }
            }}
            onDragEnd={() => setDragging(null)}
          >
            <span className="handle" aria-hidden>
              ⋮⋮
            </span>
            <span className="pos">{i + 1}</span>
            <span className="grow">{render(it)}</span>
            <button
              className="btn small"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              className="btn small"
              disabled={i === list.length - 1}
              onClick={() => move(i, i + 1)}
              aria-label="Move down"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => onSave(list.map(itemKey))}>
          Save order
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
