import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { LEGAL_LEVEL_LABELS, type LegalCheck, type LegalLevel } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';

const ORDER: LegalLevel[] = ['red', 'amber', 'green'];

/** The customer-facing report of an EC check, laid out for printing or saving as PDF. */
export function LegalReport() {
  const { id = '' } = useParams();
  const {
    data: c,
    error,
    isPending,
  } = useQuery({
    queryKey: ['bo-legal-check', id],
    queryFn: () => api<LegalCheck>(`/backoffice/legal-checks/${id}`),
  });
  if (isPending) return <div className="report">Loading…</div>;
  if (error || !c) return <div className="report error">{errorText(error)}</div>;
  const findings = c.findings.filter((f) => f.review !== 'dismissed');
  return (
    <div className="report">
      <div className="report-actions">
        <button className="btn primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        {c.status !== 'shared' ? (
          <span className="warn-text">Draft — not yet shared with the customer.</span>
        ) : null}
      </div>
      <header>
        <div className="brand-mark">P</div>
        <div>
          <h1>Property records check</h1>
          <p>
            {c.property_name ?? 'Property'} · prepared by Propittu
            {c.shared_at ? ` on ${date(c.shared_at)}` : ''}
          </p>
        </div>
      </header>
      <section className={`report-result ${c.overall ?? ''}`}>
        <b>{c.overall ? LEGAL_LEVEL_LABELS[c.overall] : 'No findings'}</b>
        {c.summary ? <p>{c.summary}</p> : null}
      </section>
      <section>
        <h2>What we checked</h2>
        <p>
          The Encumbrance Certificate (EC) issued by {c.ec_office ?? 'the Sub-Registrar office'} for{' '}
          {date(c.ec_period_from)} to {date(c.ec_period_to)}, read by Pittu and compared with your
          sale deed by our team.
        </p>
      </section>
      <section>
        <h2>What we found</h2>
        {ORDER.flatMap((level) =>
          findings
            .filter((f) => f.level === level)
            .map((f, i) => (
              <div key={`${level}-${i}`} className={`report-finding ${level}`}>
                <b>{f.title}</b>
                <p>{f.detail}</p>
                {f.staff_note ? <p className="sub">Our note: {f.staff_note}</p> : null}
              </div>
            )),
        )}
      </section>
      <section className="report-limits">
        <h2>What this report is, and isn't</h2>
        <p>
          This report shows what the official records we checked say, on the dates shown. It covers
          registered transactions on the EC for the period searched. It does not cover unregistered
          agreements, matters outside that period or office, court or revenue proceedings not
          recorded on the EC, or the physical state of the property. It is information to help you
          decide, not a legal opinion or a guarantee of title. For a formal title opinion, ask us
          about our legal partner.
        </p>
      </section>
    </div>
  );
}
