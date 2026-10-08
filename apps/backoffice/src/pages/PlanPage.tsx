import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  BILLING_PERIOD_LABELS,
  FEATURE_CODES,
  FEATURE_LABELS,
  LIMIT_CODES,
  LIMIT_LABELS,
  formatStorageMb,
  type FeatureCode,
  type LimitCode,
  type PlanBenefits,
  type StaffPlan,
  type StaffPlanVersion,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, rupees } from '../lib/format';
import { DataTable, type Column } from '../ui/DataTable';
import { planState, usePlansConsole } from './Plans';
import { useServices } from './Services';

type Period = 'none' | 'month' | 'year';
type Terms = {
  rupees: string;
  billing_period: Period;
  term_days: string;
  features: FeatureCode[];
  limits: Partial<Record<LimitCode, string>>;
  included: { code: string; quantity: string; period: 'year' | 'term' }[];
};
type Details = { code: string; name: string; description: string; sort_order: string };

const toTerms = (v: StaffPlanVersion | null): Terms => ({
  rupees: v ? String(v.price_paise / 100) : '',
  billing_period: v?.billing_period ?? 'year',
  term_days: String(v?.term_days ?? 365),
  features: v?.benefits.features ?? [...FEATURE_CODES],
  limits: Object.fromEntries(
    Object.entries(v?.benefits.limits ?? {}).map(([k, n]) => [k, String(n)]),
  ) as Terms['limits'],
  included: (v?.benefits.included ?? []).map((i) => ({ ...i, quantity: String(i.quantity) })),
});
const toVersionBody = (t: Terms) => ({
  price_paise: Math.round(Number(t.rupees || 0) * 100),
  billing_period: t.billing_period,
  term_days: Number(t.term_days),
  benefits: {
    features: t.features,
    limits: Object.fromEntries(
      Object.entries(t.limits)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, Number(v)]),
    ),
    included: t.included
      .filter((i) => i.code)
      .map((i) => ({ code: i.code, quantity: Number(i.quantity) || 1, period: i.period })),
  } satisfies PlanBenefits,
});

type Change = { less: boolean; text: string };

/** What a new version changes compared with the current one; "less" = takes something away. */
function diffVersions(
  cur: ReturnType<typeof toVersionBody>,
  next: ReturnType<typeof toVersionBody>,
  serviceName: (code: string) => string,
): Change[] {
  const out: Change[] = [];
  if (next.price_paise !== cur.price_paise)
    out.push({
      less: next.price_paise > cur.price_paise,
      text: `Price ${rupees(cur.price_paise)} → ${rupees(next.price_paise)}`,
    });
  if (next.billing_period !== cur.billing_period)
    out.push({ less: false, text: `Billed ${cur.billing_period} → ${next.billing_period}` });
  if (next.term_days !== cur.term_days)
    out.push({
      less: next.term_days < cur.term_days,
      text: `Term ${cur.term_days} → ${next.term_days} days`,
    });
  for (const f of FEATURE_CODES) {
    const had = cur.benefits.features.includes(f);
    const has = next.benefits.features.includes(f);
    if (had !== has)
      out.push({ less: had, text: `${FEATURE_LABELS[f]}: ${has ? 'added' : 'removed'}` });
  }
  for (const l of LIMIT_CODES) {
    const a = cur.benefits.limits[l];
    const b = next.benefits.limits[l];
    if (a === b) continue;
    const show = (n: number | undefined) => (n === undefined ? 'no limit' : String(n));
    out.push({
      less: b !== undefined && (a === undefined || b < a),
      text: `${LIMIT_LABELS[l]}: ${show(a)} → ${show(b)}`,
    });
  }
  const before = new Map(cur.benefits.included.map((i) => [i.code, i]));
  const after = new Map(next.benefits.included.map((i) => [i.code, i]));
  for (const [code, i] of before) {
    const n = after.get(code);
    if (!n)
      out.push({
        less: true,
        text: `Included ${serviceName(code)} (${i.quantity} per ${i.period}): removed`,
      });
    else if (n.quantity !== i.quantity || n.period !== i.period)
      out.push({
        less: n.quantity < i.quantity,
        text: `Included ${serviceName(code)}: ${i.quantity} per ${i.period} → ${n.quantity} per ${n.period}`,
      });
  }
  for (const [code, n] of after)
    if (!before.has(code))
      out.push({
        less: false,
        text: `Included ${serviceName(code)} (${n.quantity} per ${n.period}): added`,
      });
  return out.sort((a, b) => Number(b.less) - Number(a.less));
}

/** /plans/:id — the command centre for one plan (or a new one at /plans/new). */
export function PlanPage() {
  const { id = 'new' } = useParams();
  const { data, error, isPending } = usePlansConsole();
  const plan = id === 'new' ? null : data?.find((p) => p.id === id);
  if (id !== 'new' && isPending)
    return (
      <div className="page">
        <div className="empty">Loading…</div>
      </div>
    );
  if (error)
    return (
      <div className="page">
        <div className="error">{errorText(error)}</div>
      </div>
    );
  if (id !== 'new' && !plan)
    return (
      <div className="page">
        <Link to="/plans">← Plans</Link>
        <div className="empty">This plan was not found.</div>
      </div>
    );
  return <Editor key={plan?.id ?? 'new'} plan={plan ?? null} />;
}

function Editor({ plan }: { plan: StaffPlan | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const services = useServices();
  const isTrial = plan?.code === 'trial';
  const [details, setDetails] = useState<Details>({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    sort_order: String(plan?.sort_order ?? 100),
  });
  const [terms, setTerms] = useState(() => toTerms(plan?.current ?? null));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const savedTerms = JSON.stringify(toVersionBody(toTerms(plan?.current ?? null)));
  const termsDirty = JSON.stringify(toVersionBody(terms)) !== savedTerms;
  const detailsDirty =
    !!plan &&
    (details.name !== plan.name ||
      details.description !== plan.description ||
      Number(details.sort_order) !== plan.sort_order);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['bo-plans'] });
      void qc.invalidateQueries({ queryKey: ['plans'] });
      setMsg({ ok: true, text: ok });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  const patch = (body: Record<string, unknown>, ok: string) =>
    run(() => api(`/backoffice/plans/${plan!.id}`, { method: 'PATCH', body }), ok);

  const create = () =>
    run(async () => {
      const row = await api<StaffPlan>('/backoffice/plans', {
        method: 'POST',
        body: {
          code: details.code.trim(),
          name: details.name.trim(),
          description: details.description.trim(),
          sort_order: Number(details.sort_order) || 0,
          is_public: false,
          is_active: true,
          version: toVersionBody(terms),
        },
      });
      void navigate(`/plans/${row.id}`, { replace: true });
    }, 'Plan created. It is not on sale until you put it on sale.');

  const [reviewing, setReviewing] = useState(false);
  const [keepRenewals, setKeepRenewals] = useState(true);
  const serviceName = (code: string) => services.data?.find((x) => x.code === code)?.name ?? code;
  const changes = plan?.current
    ? diffVersions(toVersionBody(toTerms(plan.current)), toVersionBody(terms), serviceName)
    : [];
  const publish = () => {
    if (!plan) return;
    void run(
      () =>
        api(`/backoffice/plans/${plan.id}/versions`, {
          method: 'POST',
          body: { ...toVersionBody(terms), keep_renewals: !isTrial && keepRenewals },
        }),
      'New version published. Customers see it in the app now.',
    ).then(() => setReviewing(false));
  };

  const putT = <K extends keyof Terms>(k: K, v: Terms[K]) => {
    setMsg(null);
    setTerms((t) => ({ ...t, [k]: v }));
  };
  const usedCodes = new Set(terms.included.map((i) => i.code));
  const st = plan ? planState(plan) : null;

  return (
    <div className="page">
      <Link to="/plans">← Plans</Link>
      <div className="page-head">
        <div>
          <h1>{plan ? plan.name : 'New plan'}</h1>
          <p>
            {plan ? (
              <>
                <span className="mono">{plan.code}</span> · version {plan.current?.version ?? '—'} ·{' '}
                {plan.customers_now} customers on it now
              </>
            ) : (
              'Set it up, then put it on sale when ready.'
            )}
          </p>
        </div>
        {st ? <span className={`badge ${st.tone}`}>{st.label}</span> : null}
      </div>

      <div className="config">
        <div className="config-main">
          <section className="section">
            <div className="section-head">
              <h2>About this plan</h2>
              <span className="sub">Changes straight away for everyone.</span>
            </div>
            <div className="section-body form-grid">
              {!plan ? (
                <label className="field wide">
                  Code (permanent; lowercase, e.g. premium)
                  <input
                    value={details.code}
                    onChange={(e) => setDetails({ ...details, code: e.target.value })}
                  />
                </label>
              ) : null}
              <label className="field">
                Name
                <input
                  value={details.name}
                  onChange={(e) => setDetails({ ...details, name: e.target.value })}
                />
              </label>
              <label className="field">
                Position in the list
                <input
                  type="number"
                  min={0}
                  value={details.sort_order}
                  onChange={(e) => setDetails({ ...details, sort_order: e.target.value })}
                />
                <small>Lower numbers are shown first.</small>
              </label>
              <label className="field wide">
                Description
                <textarea
                  value={details.description}
                  onChange={(e) => setDetails({ ...details, description: e.target.value })}
                />
              </label>
              {plan ? (
                <div className="wide">
                  <button
                    className="btn"
                    disabled={!detailsDirty || busy}
                    onClick={() =>
                      void patch(
                        {
                          name: details.name.trim(),
                          description: details.description.trim(),
                          sort_order: Number(details.sort_order) || 0,
                        },
                        'Details saved.',
                      )
                    }
                  >
                    Save details
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>{isTrial ? 'Length of the Free Trial' : 'Price and term'}</h2>
              <span className="sub">Part of a version (see below).</span>
            </div>
            <div className="section-body form-grid">
              {!isTrial ? (
                <>
                  <label className="field">
                    Price in ₹
                    <input
                      type="number"
                      min={0}
                      value={terms.rupees}
                      onChange={(e) => putT('rupees', e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Billed
                    <select
                      value={terms.billing_period}
                      onChange={(e) => putT('billing_period', e.target.value as Period)}
                    >
                      <option value="year">Per year</option>
                      <option value="month">Per month</option>
                      <option value="none">Once</option>
                    </select>
                  </label>
                </>
              ) : null}
              <label className="field">
                Term in days
                <input
                  type="number"
                  min={1}
                  max={3660}
                  value={terms.term_days}
                  onChange={(e) => putT('term_days', e.target.value)}
                />
                <small>
                  {isTrial
                    ? 'How long a new customer gets everything free.'
                    : 'How long one purchase lasts.'}
                </small>
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>What it allows</h2>
              <span className="sub">Leave a limit empty for no limit.</span>
            </div>
            <div className="section-body form-grid">
              {FEATURE_CODES.map((f) => (
                <label key={f} className="check">
                  <input
                    type="checkbox"
                    checked={terms.features.includes(f)}
                    onChange={(e) =>
                      putT(
                        'features',
                        e.target.checked
                          ? [...terms.features, f]
                          : terms.features.filter((x) => x !== f),
                      )
                    }
                  />
                  {FEATURE_LABELS[f]}
                </label>
              ))}
              {LIMIT_CODES.map((l) => (
                <label key={l} className="field">
                  {LIMIT_LABELS[l]}
                  {l === 'max_storage_mb' ? ' (MB)' : ''}
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={terms.limits[l] ?? ''}
                    onChange={(e) => putT('limits', { ...terms.limits, [l]: e.target.value })}
                  />
                  {l === 'max_storage_mb' && terms.limits[l] ? (
                    <small>{formatStorageMb(Number(terms.limits[l]))}</small>
                  ) : null}
                </label>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Included services</h2>
              <span className="sub">
                Used before the customer pays for the service as an extra.
              </span>
            </div>
            <div className="section-body stack">
              {terms.included.length === 0 ? (
                <span className="sub">No services included.</span>
              ) : null}
              {terms.included.map((i, n) => (
                <div key={n} className="row">
                  <select
                    className="grow"
                    value={i.code}
                    onChange={(e) =>
                      putT(
                        'included',
                        terms.included.map((x, j) =>
                          j === n ? { ...x, code: e.target.value } : x,
                        ),
                      )
                    }
                    aria-label="Service"
                  >
                    <option value="">Choose a service…</option>
                    {services.data?.map((s) => (
                      <option
                        key={s.code}
                        value={s.code}
                        disabled={s.code !== i.code && usedCodes.has(s.code)}
                      >
                        {s.name}
                        {s.is_active ? '' : ' (hidden)'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="short"
                    type="number"
                    min={1}
                    value={i.quantity}
                    onChange={(e) =>
                      putT(
                        'included',
                        terms.included.map((x, j) =>
                          j === n ? { ...x, quantity: e.target.value } : x,
                        ),
                      )
                    }
                    aria-label="How many"
                  />
                  <select
                    value={i.period}
                    onChange={(e) =>
                      putT(
                        'included',
                        terms.included.map((x, j) =>
                          j === n ? { ...x, period: e.target.value as 'year' | 'term' } : x,
                        ),
                      )
                    }
                    aria-label="Per"
                  >
                    <option value="year">per year</option>
                    <option value="term">per term</option>
                  </select>
                  <button
                    className="btn small danger"
                    onClick={() =>
                      putT(
                        'included',
                        terms.included.filter((_, j) => j !== n),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div>
                <button
                  className="btn small"
                  onClick={() =>
                    putT('included', [
                      ...terms.included,
                      { code: '', quantity: '1', period: 'year' },
                    ])
                  }
                >
                  Include a service
                </button>
              </div>
            </div>
          </section>

          <section className={`section publish ${termsDirty ? 'dirty' : ''}`}>
            <div className="section-body stack">
              {plan ? (
                <>
                  <b>
                    {termsDirty
                      ? `You changed the price, term or benefits. Publish them as version ${(plan.versions[0]?.version ?? 0) + 1}.`
                      : 'Price, term and benefits match the current version.'}
                  </b>
                  <span className="sub">
                    A version is never edited after it is published:{' '}
                    {isTrial ? 'new trials' : 'new purchases and renewals'} use the newest one,
                    while customers keep the version they got until their term ends.
                  </span>
                  <div className="row">
                    <button
                      className="btn primary"
                      disabled={!termsDirty || busy}
                      onClick={() => setReviewing(true)}
                    >
                      Review and publish…
                    </button>
                    <button
                      className="btn"
                      disabled={!termsDirty || busy}
                      onClick={() => {
                        setTerms(toTerms(plan.current));
                        setReviewing(false);
                      }}
                    >
                      Undo changes
                    </button>
                  </div>
                  {reviewing && termsDirty ? (
                    <div className="review">
                      <b>Version {(plan.versions[0]?.version ?? 0) + 1} changes</b>
                      <ul>
                        {changes.map((c) => (
                          <li key={c.text} className={c.less ? 'less' : ''}>
                            {c.less ? '▼ ' : '▲ '}
                            {c.text}
                          </li>
                        ))}
                      </ul>
                      <div className="impact">
                        <b>Who is affected</b>
                        <span>
                          {isTrial ? 'Customers who start a trial' : 'Customers who buy'} from now
                          on get this version.
                        </span>
                        <span>
                          The {plan.current?.customers_now ?? 0} customer
                          {plan.current?.customers_now === 1 ? '' : 's'} on version{' '}
                          {plan.current?.version} keep everything they have now, including any
                          included services removed here, until their term ends
                          {isTrial ? '' : ' (also when the team adds time to their plan)'}.
                        </span>
                      </div>
                      {!isTrial ? (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={keepRenewals}
                            onChange={(e) => setKeepRenewals(e.target.checked)}
                          />
                          {keepRenewals
                            ? `When they renew, they stay on version ${plan.current?.version} (same price and benefits). You can change this later in the version history.`
                            : 'When they renew, they move to this new version.'}
                        </label>
                      ) : null}
                      <div className="row">
                        <button className="btn primary" disabled={busy} onClick={publish}>
                          Confirm and publish
                        </button>
                        <button className="btn" onClick={() => setReviewing(false)}>
                          Keep editing
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="row">
                  <button
                    className="btn primary"
                    disabled={busy || !details.code || !details.name}
                    onClick={() => void create()}
                  >
                    Create plan
                  </button>
                  <span className="sub">It starts not on sale.</span>
                </div>
              )}
              {msg ? <span className={msg.ok ? 'note-ok' : 'error'}>{msg.text}</span> : null}
            </div>
          </section>
        </div>

        <aside className="config-side">
          {plan ? (
            <section className="section">
              <div className="section-head">
                <h2>For customers</h2>
              </div>
              <div className="section-body stack">
                {!isTrial ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={plan.is_public}
                      disabled={busy || !plan.is_active}
                      onChange={(e) =>
                        void patch(
                          { is_public: e.target.checked },
                          e.target.checked
                            ? 'On sale: customers can buy it now.'
                            : 'Taken off sale. Existing customers keep it.',
                        )
                      }
                    />
                    On sale — listed in the app and can be bought
                  </label>
                ) : null}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={plan.is_active}
                    disabled={busy}
                    onChange={(e) => {
                      if (
                        !e.target.checked &&
                        !window.confirm(
                          isTrial
                            ? 'Switch off the Free Trial? New customers will not get a trial.'
                            : 'Switch this plan off? It cannot be sold or given. Existing customers keep it until their term ends.',
                        )
                      )
                        return;
                      void patch(
                        { is_active: e.target.checked },
                        e.target.checked ? 'Switched on.' : 'Switched off.',
                      );
                    }}
                  />
                  {isTrial
                    ? 'Give new customers a Free Trial'
                    : 'Switched on (can be sold or given by the team)'}
                </label>
                <Link to={`/customers?plan=${encodeURIComponent(plan.name)}`}>
                  See the {plan.customers_now} customers on {plan.name}
                </Link>
              </div>
            </section>
          ) : null}
          <Preview name={details.name} terms={terms} services={services.data ?? []} />
          {plan ? <Versions plan={plan} /> : null}
        </aside>
      </div>
    </div>
  );
}

/** Roughly how the plan reads in the app. */
function Preview({
  name,
  terms,
  services,
}: {
  name: string;
  terms: Terms;
  services: { code: string; name: string }[];
}) {
  const price = Math.round(Number(terms.rupees || 0) * 100);
  return (
    <section className="section">
      <div className="section-head">
        <h2>What customers see</h2>
      </div>
      <div className="section-body stack preview">
        <b>{name || 'Plan name'}</b>
        <span>
          {price ? rupees(price) : 'Free'} {BILLING_PERIOD_LABELS[terms.billing_period]}
        </span>
        <span className="sub">
          Up to {terms.limits.max_properties || 'unlimited'} properties · {terms.term_days} days
        </span>
        {terms.included.filter((i) => i.code).length ? (
          <ul>
            {terms.included
              .filter((i) => i.code)
              .map((i) => (
                <li key={i.code}>
                  {i.quantity} × {services.find((s) => s.code === i.code)?.name ?? i.code}{' '}
                  {i.period === 'year' ? 'a year' : 'per term'}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Versions({ plan }: { plan: StaffPlan }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (v: StaffPlanVersion, keep: boolean) => {
    setErr(null);
    try {
      await api(`/backoffice/plan-versions/${v.id}`, {
        method: 'PATCH',
        body: { renewals_keep: keep },
      });
      await qc.invalidateQueries({ queryKey: ['bo-plans'] });
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const cols: Column<StaffPlanVersion>[] = [
    {
      key: 'v',
      header: 'Version',
      sort: (v) => v.version,
      render: (v) => (
        <>
          v{v.version} {v.is_current ? <span className="badge good">current</span> : null}
        </>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sort: (v) => v.price_paise,
      render: (v) => (v.price_paise ? rupees(v.price_paise) : 'Free'),
    },
    {
      key: 'term',
      header: 'Days',
      align: 'right',
      sort: (v) => v.term_days,
      render: (v) => v.term_days,
    },
    {
      key: 'customers',
      header: 'On it now',
      align: 'right',
      sort: (v) => v.customers_now,
      render: (v) => v.customers_now,
    },
    {
      key: 'date',
      header: 'Published',
      sort: (v) => v.created_at,
      render: (v) => date(v.created_at),
    },
    ...(plan.code === 'trial'
      ? []
      : [
          {
            key: 'renew',
            header: 'Renews on itself',
            sort: (v: StaffPlanVersion) => (v.renewals_keep ? 1 : 0),
            render: (v: StaffPlanVersion) =>
              v.is_current ? (
                <span className="sub">newest</span>
              ) : (
                <input
                  type="checkbox"
                  checked={v.renewals_keep}
                  aria-label={`Customers on v${v.version} renew on it`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => void toggle(v, e.target.checked)}
                />
              ),
          },
        ]),
  ];
  return (
    <>
      <div className="section-title">Version history</div>
      <DataTable
        rows={plan.versions}
        columns={cols}
        rowKey={(v) => v.id}
        defaultSort={{ key: 'v', dir: 'desc' }}
      />
      {plan.code !== 'trial' ? (
        <span className="sub">
          Ticked: customers on that version renew on it, at its price and benefits. Unticked: they
          move to the newest version when they renew.
        </span>
      ) : null}
      {err ? <span className="error">{err}</span> : null}
    </>
  );
}
