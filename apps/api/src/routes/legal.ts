import { Router } from 'express';
import { SUPPORT_EMAIL } from '@propittu/shared';

/**
 * Public legal pages (no login), linked from the app and the store
 * listings: privacy policy, terms of use, and how to delete an account
 * (Google Play requires a web page for this).
 *
 * DRAFT for legal review by an Indian lawyer before launch. Items marked
 * [to be confirmed] (highlighted on the page) need the company's details
 * or a business decision.
 */
export const legalRouter = Router();

const UPDATED = '7 October 2026';

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Propittu</title>
<style>
:root{--text:#14182F;--muted:#5B6178;--primary:#4338CA;--bg:#F7F8FC;--card:#FFFFFF;--line:#E6E8F0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);
font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
.brand{color:var(--primary);font-weight:800;font-size:20px;letter-spacing:-.3px;margin-bottom:24px}
h1{font-size:28px;line-height:1.2;margin:0 0 4px}h2{font-size:19px;margin:32px 0 8px}
.updated{color:var(--muted);font-size:14px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px}
p,li{color:var(--text)}mark{background:#FEF3C7;color:inherit;padding:0 2px;border-radius:3px}ul{padding-left:20px}a{color:var(--primary)}
.note{color:var(--muted);font-size:14px}
nav{margin-top:40px;font-size:14px;color:var(--muted)}nav a{margin-right:16px}
</style></head><body><main>
<div class="brand">Propittu</div>
<h1>${title}</h1><div class="updated">Last updated ${UPDATED}</div>
<div class="card">${body}</div>
<nav><a href="/legal/privacy">Privacy policy</a><a href="/legal/terms">Terms of use</a><a href="/legal/delete-account">Delete your account</a></nav>
</main></body></html>`;
}

const mail = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;

const TBC = (what: string) => `<mark>[to be confirmed: ${what}]</mark>`;
const OPERATOR = `${TBC('company legal name, CIN and registered address')}`;

const PRIVACY = page(
  'Privacy policy',
  `
<p>Propittu (“Propittu”, “we”, “us”) helps property owners keep their property records, documents, photos and
videos in one place and request property-care and paperwork services. This policy explains what personal data
we collect, why, who we share it with, how long we keep it, and your rights under India’s Digital Personal Data
Protection Act, 2023 (“DPDP Act”). Propittu is operated by ${OPERATOR}, the Data Fiduciary for your data.</p>

<h2>What we collect</h2>
<ul>
<li><strong>Account:</strong> your mobile number (to sign you in with a one-time code) and, if you add it, your name.</li>
<li><strong>Your properties:</strong> what you enter (name, type, address, PIN code, map location, area, survey /
Khata / property numbers, notes) and the documents, photos and videos you upload.</li>
<li><strong>Answers you give us:</strong> for example how you are related to a property, whether its Khata is in the
owner’s name, or whether this year’s tax is paid — so we can suggest the right services.</li>
<li><strong>Services and support:</strong> what you request, preferred dates, messages and files you send us, and
the visit reports, outcomes and files we deliver.</li>
<li><strong>Payments:</strong> what you bought, amounts and status. Card and UPI details are handled by our payment
provider (Razorpay); we never see or store them.</li>
<li><strong>Location:</strong> only when you place a property on the map, and only while the app is open. We use a
property’s PIN code and state to tell which of our services reach it.</li>
<li><strong>Technical:</strong> basic request logs (time, IP address, device and app version, errors) to keep the
service secure and working.</li>
</ul>
<p>We do not ask for, and do not keep, PAN or Aadhaar numbers, photographs of people or thumbprints. If a document
you upload contains them, they stay inside that file, which only you and authorised staff can open.</p>

<h2>Reading documents with AI (“Pittu”)</h2>
<p>Where this feature is available to you and you choose to upload a sale deed for it, the document is sent to our
AI provider, Anthropic, PBC (USA), to read details such as the property’s address, area and registration number.
Anthropic processes it on our behalf under contract, does not use it to train its models, and keeps it only for
a limited period under its terms. What it reads is shown to you as <em>suggestions</em>: nothing is saved to your
property until you check and confirm it. You can always enter the details yourself instead.</p>

<h2>Why we use your data</h2>
<ul>
<li>To provide the service you asked for: sign-in, keeping your property records, delivering requested services,
and support.</li>
<li>To take payments and keep the accounting records the law requires.</li>
<li>To keep the service secure: preventing fraud and misuse, and keeping an audit trail of important actions.</li>
<li>To tell you about your requests and account (for example a sign-in code or a service update).</li>
</ul>
<p>By creating an account and using these features you consent to this use. You can withdraw consent at any time
by deleting your account (below); this does not affect what was done before. We do not sell your data and do not
use it for advertising.</p>

<h2>Who can see it</h2>
<ul>
<li><strong>You</strong>, signed in with your mobile number.</li>
<li><strong>Authorised Propittu staff and field partners</strong>, only as needed to deliver a service or support.
Access is limited by role and recorded.</li>
<li><strong>Processors that run Propittu for us</strong>, under contract and only for that purpose: database and file
storage (Supabase — stored in Mumbai, India), application servers (Vercel — Mumbai region), payments (Razorpay),
SMS delivery, app updates (Expo), and document reading (Anthropic — USA, as described above).</li>
<li>Government authorities, where the law requires it.</li>
</ul>

<h2>How long we keep it</h2>
<ul>
<li>Your account, properties, files, answers, requests and messages: while your account is open.</li>
<li>When you delete your account, they are deleted. Payment records (orders, payments, refunds) are kept for as
long as Indian tax and company law requires (currently up to 8 years), no longer linked to your name or number,
together with our security audit trail.</li>
<li>Server request logs: a short period, for security and troubleshooting.</li>
</ul>

<h2>Your rights</h2>
<ul>
<li><strong>Access and correction:</strong> see and correct your information in the app at any time, or ask us for a
summary of the personal data we hold and who we shared it with.</li>
<li><strong>Erasure:</strong> delete your account in the app (Profile, at the bottom: Delete account) or by writing to us.</li>
<li><strong>Nomination:</strong> you may nominate a person to exercise these rights for you in the event of your death
or incapacity, by writing to us.</li>
<li><strong>Grievances:</strong> write to our Grievance Officer, ${TBC('name')}, at ${mail}. We acknowledge within
48 hours and aim to resolve within 7 days. If you are not satisfied, you may approach the Data Protection Board
of India.</li>
</ul>

<h2>Security</h2>
<p>Files are stored privately and opened only through short-lived links. Each account can reach only its own data,
enforced in the database itself. Connections are encrypted. If a personal data breach affects you, we will inform
you and the Data Protection Board as the law requires.</p>

<h2>Children</h2>
<p>Propittu is for adults (18+) who own or manage property. We do not knowingly create accounts for children.</p>

<h2>Changes</h2>
<p>If we change this policy in a way that matters, we will tell you in the app before it applies.</p>
<p class="note">Questions: ${mail}</p>
`,
);

const TERMS = page(
  'Terms of use',
  `
<p>These terms are an agreement between you and ${OPERATOR} (“Propittu”, “we”) for the Propittu app, website and
services. By creating an account you agree to them and to our <a href="/legal/privacy">privacy policy</a>.</p>

<h2>1. Who can use Propittu</h2>
<p>You must be 18 or older and able to enter a contract under Indian law. Use Propittu only for properties you own
or are authorised to manage, and only share information and files you are entitled to share.</p>

<h2>2. The service</h2>
<p>Propittu keeps your property records (details, documents, photos, videos) in one place and lets you request
property-care services (visits, inspections, cleaning, repairs) and paperwork help (such as property tax or Khata
assistance). <strong>Propittu is not a law firm, surveyor, valuer or government body and does not give legal,
tax or financial advice.</strong> Nothing in the app verifies or certifies title to a property.</p>

<h2>3. Your account</h2>
<ul>
<li>You sign in with your Indian mobile number and a one-time code. Keep your phone secure; actions from your account
are treated as yours.</li>
<li>Don’t misuse the service: no unlawful or misleading content, no attempts to reach other accounts, and no
interference with the service.</li>
</ul>

<h2>4. Your content</h2>
<p>You keep ownership of everything you upload. You allow us to store, process and show it to you and to authorised
staff only to provide the service, and you confirm you have the right to upload it. You are responsible for
keeping your own copies of important original documents.</p>

<h2>5. Pittu (AI-read details)</h2>
<p>Details read from a document by Pittu are suggestions and can be wrong or incomplete. Check them against the
original before relying on them; what you confirm is treated as entered by you.</p>

<h2>6. Plans, trial and payments</h2>
<ul>
<li>New accounts get one free trial per mobile number. After it ends, a paid plan is needed to keep adding and
managing records; your existing data is kept and you can still see it.</li>
<li>Each plan covers a number of properties per term. A property counts towards the term once added, even if it is
later deleted; the count resets at the next term.</li>
<li>Plans run for the period shown at purchase and <strong>do not renew automatically</strong>. Upgrading mid-term
credits the unused part of your current plan. New prices apply only to new purchases and renewals.</li>
<li>Extra services are priced before you pay and charged only after we confirm them. Government fees, taxes,
stamp duty, penalties and third-party charges are not included unless the price says so.</li>
<li>Payments are processed by Razorpay. Prices include applicable taxes unless shown otherwise.</li>
<li><strong>Cancellations and refunds:</strong> ${TBC('refund policy — suggested: a plan is refundable within 7 days of purchase if no included service was used; an extra service can be cancelled free until we confirm it, and is refunded in full if we cancel it')}.</li>
</ul>

<h2>7. Where we serve</h2>
<p>You can add a property anywhere. Visits are available only where our team operates, and paperwork help only in
the states we support; the app shows what is available for each property. We may add or change areas.</p>

<h2>8. Services at your property</h2>
<ul>
<li>You confirm you are entitled to let us visit and that the property can be safely and lawfully accessed. We
schedule visits around your preferred date; the confirmed date is shown in the app.</li>
<li>Visit reports describe what our team observed on the day. They are not a structural, legal or valuation
certificate, and we are not responsible for conditions that existed before or arise after a visit.</li>
<li>For paperwork help we act on your instructions as a facilitator. Outcomes and timelines depend on the
authorities, and we cannot guarantee them.</li>
</ul>

<h2>9. Liability</h2>
<p>We provide the service with reasonable care, but “as is” and “as available”. To the extent the law allows, we are
not liable for indirect or consequential losses, and our total liability for any claim is limited to the amount
you paid us in the 12 months before the claim. You agree to compensate us for losses caused by your breach of
these terms or by content you upload without the right to do so. We are not responsible for delays or failures
caused by events beyond our reasonable control. Nothing here limits your rights under Indian consumer law.</p>

<h2>10. Ending</h2>
<p>You can delete your account at any time from the app. We may suspend or close accounts that break these terms or
the law, and will tell you why unless the law prevents it.</p>

<h2>11. Changes and contact</h2>
<p>We will tell you in the app before material changes to these terms apply. Grievance Officer: ${TBC('name')},
${mail} — we acknowledge complaints within 48 hours and aim to resolve them within one month.</p>

<h2>12. Law</h2>
<p>These terms are governed by the laws of India. Subject to your consumer rights, disputes are subject to the
courts at Bengaluru, Karnataka.</p>
<p class="note">Questions: ${mail}</p>
`,
);

const DELETE = page(
  'Delete your Propittu account',
  `
<h2>In the app (fastest)</h2>
<ol>
<li>Open Propittu and sign in.</li>
<li>Go to <strong>Profile</strong>, scroll to the bottom and tap <strong>Delete account</strong>.</li>
<li>Type <strong>DELETE MY ACCOUNT</strong>, tap <strong>Delete account</strong> and confirm.</li>
</ol>
<p>Your account is deleted immediately.</p>

<h2>By email</h2>
<p>If you can’t use the app, write to ${mail} from any address, with the mobile number of the account. We will
confirm it is you (by a code sent to that number) and delete the account within 7 days.</p>

<h2>What is deleted</h2>
<ul>
<li>Your login, name and mobile number.</li>
<li>All your properties and their details, documents, photos and videos.</li>
<li>Your service requests, visit reports, outcomes and result files.</li>
<li>Your support tickets, messages and attachments.</li>
</ul>

<h2>What is kept</h2>
<ul>
<li>Payment records (what was bought, amount, date), as required by Indian tax and accounting law — no longer linked to your name or number.</li>
<li>Our security audit trail.</li>
</ul>
<p class="note">Any unused plan time is forfeited when the account is deleted.</p>
`,
);

legalRouter.get('/legal/privacy', (_req, res) => {
  res.type('html').send(PRIVACY);
});
legalRouter.get('/legal/terms', (_req, res) => {
  res.type('html').send(TERMS);
});
legalRouter.get('/legal/delete-account', (_req, res) => {
  res.type('html').send(DELETE);
});
