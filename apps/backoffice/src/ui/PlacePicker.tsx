import { useState } from 'react';
import type { CoverageSummaryRow } from '@propittu/shared';

type Kind = 'state' | 'district' | 'pincode';

/**
 * Pick many places at once: tick states, tick districts of a state, or paste
 * PIN codes (commas, spaces or new lines). Values: a state, "District|State",
 * or a PIN. `taken` greys out what is already added.
 */
export function PlacePicker({
  summary,
  taken,
  onAdd,
  busy,
  pinLabel = 'Add PIN codes',
}: {
  summary: CoverageSummaryRow[];
  taken: (kind: Kind, value: string) => boolean;
  onAdd: (kind: Kind, values: string[]) => void;
  busy?: boolean;
  pinLabel?: string;
}) {
  const [tab, setTab] = useState<Kind>('district');
  const [find, setFind] = useState('');
  const [state, setState] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const states = [...new Set(summary.map((r) => r.state))].sort();
  const pinsByState = new Map<string, number>();
  for (const r of summary) pinsByState.set(r.state, (pinsByState.get(r.state) ?? 0) + r.pins);

  const reset = () => {
    setPicked(new Set());
    setFind('');
  };
  const options: { value: string; label: string; hint: string }[] =
    tab === 'state'
      ? states.map((s) => ({ value: s, label: s, hint: `${pinsByState.get(s) ?? 0} PINs` }))
      : summary
          .filter((r) => r.state === state)
          .map((r) => ({
            value: `${r.district}|${r.state}`,
            label: r.district,
            hint: `${r.pins} PINs`,
          }));
  const shown = options.filter((o) => o.label.toLowerCase().includes(find.trim().toLowerCase()));
  const free = shown.filter((o) => !taken(tab, o.value));
  const toggle = (v: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const valid = [...new Set(tokens.filter((t) => /^[1-9][0-9]{5}$/.test(t)))];
  const invalid = tokens.filter((t) => !/^[1-9][0-9]{5}$/.test(t));
  const fresh = valid.filter((p) => !taken('pincode', p));

  return (
    <div className="picker">
      <div className="tabs" role="group" aria-label="Add by">
        {(
          [
            ['district', 'Districts'],
            ['state', 'Whole states'],
            ['pincode', 'PIN codes'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            aria-pressed={tab === k}
            onClick={() => {
              setTab(k);
              reset();
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'pincode' ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste PIN codes — separated by commas, spaces or new lines. e.g. 560001, 560038, 560066"
          />
          <div className="row between">
            <span className="sub">
              {tokens.length === 0
                ? 'Paste as many as you like.'
                : `${fresh.length} ready to add${valid.length - fresh.length ? ` · ${valid.length - fresh.length} already in` : ''}${
                    invalid.length
                      ? ` · ${invalid.length} not a PIN code (${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''})`
                      : ''
                  }`}
            </span>
            <button
              className="btn small primary"
              disabled={!fresh.length || busy}
              onClick={() => {
                onAdd('pincode', fresh);
                setText('');
              }}
            >
              {pinLabel} ({fresh.length})
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row">
            {tab === 'district' ? (
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  reset();
                }}
                aria-label="State"
              >
                <option value="">Choose a state…</option>
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : null}
            {tab === 'state' || state ? (
              <input
                type="search"
                className="grow"
                placeholder={tab === 'state' ? 'Find a state' : 'Find a district'}
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            ) : null}
          </div>
          {tab === 'state' || state ? (
            <>
              <div className="row between">
                <span className="sub">
                  {picked.size} selected · {options.length}{' '}
                  {tab === 'state' ? 'states' : 'districts'}
                </span>
                <div className="row">
                  <button
                    className="link"
                    onClick={() => setPicked(new Set(free.map((o) => o.value)))}
                  >
                    Select all{find ? ' shown' : ''}
                  </button>
                  <button className="link" onClick={() => setPicked(new Set())}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="checklist">
                {shown.map((o) => {
                  const already = taken(tab, o.value);
                  return (
                    <label key={o.value} className={`check ${already ? 'muted' : ''}`}>
                      <input
                        type="checkbox"
                        checked={already || picked.has(o.value)}
                        disabled={already}
                        onChange={() => toggle(o.value)}
                      />
                      <span>
                        {o.label} <small>{already ? 'added' : o.hint}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div>
                <button
                  className="btn small primary"
                  disabled={!picked.size || busy}
                  onClick={() => {
                    onAdd(tab, [...picked]);
                    setPicked(new Set());
                  }}
                >
                  Add {picked.size} {tab === 'state' ? 'state' : 'district'}
                  {picked.size === 1 ? '' : 's'}
                </button>
              </div>
            </>
          ) : (
            <span className="sub">Choose a state to see its districts.</span>
          )}
        </>
      )}
    </div>
  );
}
