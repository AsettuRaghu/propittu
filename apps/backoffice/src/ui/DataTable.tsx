import { useMemo, useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sort?: (row: T) => string | number | null;
  /** Value in the CSV export (defaults to the sort value). */
  csv?: (row: T) => string | number | null;
  align?: 'right';
};

type Props<T> = {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Text searched by the box above the table; omit to hide the box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra controls in the toolbar (filters). */
  toolbar?: ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  selected?: string | null;
  onRowClick?: (row: T) => void;
  /** File name for "Export CSV"; omit to hide the button. */
  exportName?: string;
  loading?: boolean;
  error?: string | null;
  empty?: string;
  pageSize?: number;
  /** While a row is open beside the list, show this short version of each row instead. */
  compact?: (row: T) => ReactNode;
};

/**
 * The portal's one table: search, sortable columns, "Show more" paging and a
 * CSV export of what is filtered. Every list page uses it, so they all behave
 * the same.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = 'Search',
  toolbar,
  defaultSort,
  selected,
  onRowClick,
  exportName,
  loading,
  error,
  empty = 'Nothing here.',
  pageSize = 50,
  compact,
}: Props<T>) {
  const narrow = !!compact && !!selected;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(defaultSort ?? null);
  const [limit, setLimit] = useState(pageSize);

  const shown = useMemo(() => {
    let list = rows ?? [];
    const needle = q.trim().toLowerCase();
    if (needle && searchText)
      list = list.filter((r) => searchText(r).toLowerCase().includes(needle));
    const col = sort && columns.find((c) => c.key === sort.key);
    if (sort && col?.sort) {
      const get = col.sort;
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x < y ? -1 : 1) * dir;
      });
    }
    return list;
  }, [rows, q, searchText, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );

  const exportCsv = () => {
    const cell = (v: unknown) => {
      const t = v === null || v === undefined ? '' : String(v as string | number);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [
      columns.map((c) => cell(c.header)).join(','),
      ...shown.map((r) => columns.map((c) => cell((c.csv ?? c.sort)?.(r) ?? '')).join(',')),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section">
      <div className="toolbar">
        {searchText ? (
          <input
            type="search"
            className="search"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(pageSize);
            }}
            aria-label={searchPlaceholder}
          />
        ) : null}
        {narrow ? null : toolbar}
        <span className="toolbar-end">
          {rows ? (
            <span className="sub">
              {shown.length === rows.length
                ? `${rows.length}`
                : `${shown.length} of ${rows.length}`}
            </span>
          ) : null}
          {exportName && shown.length > 0 && !narrow ? (
            <button className="btn small" onClick={exportCsv}>
              Export CSV
            </button>
          ) : null}
        </span>
      </div>
      {loading ? <div className="empty">Loading…</div> : null}
      {error ? <div className="empty error">{error}</div> : null}
      {rows && shown.length === 0 ? <div className="empty">{q ? 'No matches.' : empty}</div> : null}
      {narrow && shown.length > 0 ? (
        <ul className="compact-list">
          {shown.slice(0, limit).map((r) => {
            const k = rowKey(r);
            return (
              <li key={k}>
                <button
                  className={selected === k ? 'selected' : ''}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {compact(r)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!narrow && shown.length > 0 ? (
        <div className="table-wrap">
          <table className={onRowClick ? 'clickable' : ''}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === 'right' ? 'num' : ''}>
                    {c.sort ? (
                      <button
                        className="sort"
                        onClick={() => toggle(c.key)}
                        aria-sort={
                          sort?.key === c.key
                            ? sort.dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                      >
                        {c.header}
                        <span aria-hidden>
                          {sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r) => {
                const k = rowKey(r);
                return (
                  <tr
                    key={k}
                    className={selected === k ? 'selected' : ''}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {shown.length > limit ? (
        <div className="more">
          <button className="btn small" onClick={() => setLimit((n) => n + pageSize)}>
            Show {Math.min(pageSize, shown.length - limit)} more
          </button>
        </div>
      ) : null}
    </section>
  );
}
