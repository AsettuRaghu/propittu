import { Router } from 'express';
import { SUPPORT_EMAIL } from '@propittu/shared';

/**
 * Public legal pages (no login), linked from the app and the store
 * listings: privacy policy, terms of use, and how to delete an account
 * (Google Play requires a web page for this).
 *
 * DRAFT for legal review. Items marked [to be confirmed] need the
 * company's details before launch.
 */
export const legalRouter = Router();

const UPDATED = '6 October 2026';

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
p,li{color:var(--text)}ul{padding-left:20px}a{color:var(--primary)}
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

const PRIVACY = page(
  'Privacy policy',
  `
<p>Propittu (“Propittu”, “we”, “us”) helps property owners keep their property information, documents,
photos and videos in one place and request property-care and paperwork services. This policy explains what
personal data we collect, why, how long we keep it, and your rights under India’s Digital Personal Data
Protection Act, 2023. The service is operated by [to be confirmed: company legal name and registered address].</p>

<h2>What we collect</h2>
<ul>
<li><strong>Account:</strong> your mobile number (to sign you in with a one-time code) and, if you add it, your name.</li>
<li><strong>Your properties:</strong> the details you enter (name, type, address, map location, area, survey / Khata / property numbers, notes) and the documents, photos and videos you upload.</li>
<li><strong>Services and support:</strong> the services you request, preferred dates, messages and files you send us, and the visit reports, outcomes and result files we deliver.</li>
<li><strong>Payments:</strong> what you bought, amounts and status. Card and UPI details are handled by our payment provider (Razorpay); we never see or store them.</li>
<li><strong>Location:</strong> only when you choose to place a property on the map, and only while the app is open.</li>
<li><strong>Technical:</strong> basic request logs (time, IP address, device/app version, errors) to keep the service secure and working.</li>
</ul>

<h2>Why we use it</h2>
<ul>
<li>To provide the service: sign-in, storing your property records, delivering the services you request, and support.</li>
<li>To take payments and keep the accounting records the law requires.</li>
<li>To keep the service secure: preventing fraud and misuse, and keeping an audit trail of important actions.</li>
<li>To tell you about your requests and account (for example, an SMS sign-in code or a service update).</li>
</ul>
<p>We do not sell your data, and we do not use your documents or photos for advertising.</p>

<h2>Who can see it</h2>
<ul>
<li><strong>You</strong>, signed in with your mobile number.</li>
<li><strong>Authorised Propittu staff</strong>, only as needed to deliver services and support. Their access is limited by role and recorded.</li>
<li><strong>Service providers that run Propittu for us</strong>, under contract and only for that purpose: cloud database and file storage (Supabase, data stored in Mumbai, India), application servers (Vercel, Mumbai region), payments (Razorpay), SMS delivery, and app updates (Expo).</li>
<li>Authorities, where the law requires it.</li>
</ul>

<h2>How long we keep it</h2>
<ul>
<li>Your account, properties, files, requests and messages: for as long as your account is open.</li>
<li>When you delete your account they are deleted, except payment records (orders, payments, refunds), which we must keep for the period required by Indian tax and accounting law, and our security audit trail.</li>
<li>Request logs on our servers are kept for a short period for security and troubleshooting.</li>
</ul>

<h2>Your rights</h2>
<p>You can see and correct your information in the app at any time, and delete your account in the app
(Profile → Delete account) or by writing to us. You can also ask us what data we hold about you, or raise a
concern, at ${mail}. If you are not satisfied with our response, you may approach the Data Protection Board of India.</p>
<p><strong>Grievance officer:</strong> [to be confirmed: name], ${mail}. We aim to respond within 7 days.</p>

<h2>Security</h2>
<p>Your files are stored privately and can only be opened through short-lived links. Every account can only reach
its own data, which is enforced in the database itself. Connections are encrypted.</p>

<h2>Children</h2>
<p>Propittu is meant for adults (18+) who own or manage property.</p>

<h2>Changes</h2>
<p>If we change this policy in a way that matters, we will tell you in the app before it applies.</p>
<p class="note">Questions: ${mail}</p>
`,
);

const TERMS = page(
  'Terms of use',
  `
<p>These terms apply when you use the Propittu app and services, operated by [to be confirmed: company legal name
and registered address]. By creating an account you agree to them.</p>

<h2>The service</h2>
<p>Propittu lets you keep your property records (details, documents, photos, videos) in one place, and request
property-care services (such as visits, inspections, cleaning and repairs) and paperwork help (such as property tax
or Khata assistance). Paperwork help is done on your instructions; Propittu is not a law firm and does not give legal advice.</p>

<h2>Your account</h2>
<ul>
<li>You sign in with your Indian mobile number and a one-time code. Keep your phone secure; actions from your account are treated as yours.</li>
<li>Only upload information and files you are entitled to share, about properties you own or are authorised to manage.</li>
<li>Don’t misuse the service: no unlawful content, attempts to access other accounts, or interference with the service.</li>
</ul>

<h2>Plans, trial and payments</h2>
<ul>
<li>New accounts get a free trial. After it ends, a paid plan is needed to keep adding and managing properties; your data is kept and you can still see it.</li>
<li>Plans run for the period shown when you buy them and do not renew automatically. Upgrading mid-term credits the unused part of your current plan.</li>
<li>Extra services are priced before you pay and are paid only after we confirm them.</li>
<li>Payments are processed by Razorpay. Prices include applicable taxes unless shown otherwise.</li>
<li>Refunds: [to be confirmed: refund policy]. If we cancel a service you have paid for, we refund it in full.</li>
</ul>

<h2>Services at your property</h2>
<p>We will try to visit on your preferred date; the confirmed date is shown in the app. Visit reports describe what
our team observed on the day and are not a structural or legal certification.</p>

<h2>Liability</h2>
<p>We take care to provide the service well, but it is provided “as is”. To the extent the law allows, our total
liability for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing in these
terms limits rights you have under Indian consumer law.</p>

<h2>Ending</h2>
<p>You can delete your account at any time (Profile → Delete account). We may suspend accounts that break these
terms, and will tell you why.</p>

<h2>Law</h2>
<p>These terms are governed by the laws of India. Disputes are subject to the courts at [to be confirmed: city].</p>
<p class="note">Questions: ${mail}</p>
`,
);

const DELETE = page(
  'Delete your Propittu account',
  `
<h2>In the app (fastest)</h2>
<ol>
<li>Open Propittu and sign in.</li>
<li>Go to <strong>Profile → Delete account</strong>.</li>
<li>Type <strong>DELETE</strong> and confirm.</li>
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
