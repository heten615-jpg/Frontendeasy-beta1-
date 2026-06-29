# Configuring custom SMTP for Supabase Auth

Supabase's built-in email is **capped at 2 emails per hour per project** —
fine for the first dev session, useless once real users start signing up.
This guide swaps it for either **Resend Free** (preferred — cleanest dev
experience) or **Brevo Free** (higher daily volume).

| Provider | Free quota | Daily cap | Verified domains |
|---|---|---|---|
| Resend Free | 3,000 emails / month | 100 / day | 1 |
| Brevo Free  | 9,000 emails / month | 300 / day | 1 |

Both work. Pick **Resend** if you want the simplest setup; pick **Brevo** if
you need the higher daily cap.

> Skip this until you actually need it. The editor functions perfectly with
> Supabase's built-in email during early development.

## Prerequisites

- A domain you control (the one used for the production deploy — see
  [`DEPLOY.md`](./DEPLOY.md)). You'll send `noreply@yourdomain.com` from it.
- Access to its DNS (Cloudflare DNS, Namecheap, etc.) so you can add SPF /
  DKIM / DMARC records.
- The live Supabase project from [`../supabase/README.md`](../supabase/README.md).

---

## Option A — Resend Free (recommended)

### 1. Sign up

Go to https://resend.com → Sign up. Free plan ships immediately.

### 2. Add and verify your domain

Resend dashboard → **Domains** → **Add Domain** → enter `yourdomain.com`.
You'll get three DNS records to add:

| Type | Host | Value |
|---|---|---|
| TXT  | `resend._domainkey` | (DKIM public key) |
| TXT  | `@`                 | `v=spf1 include:_spf.resend.com ~all` |
| MX   | `send`              | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |

Add them at your DNS provider, then click **Verify DNS records**. Propagation
usually takes <5 minutes.

### 3. (Recommended) Add a DMARC record

| Type | Host | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Resend doesn't require DMARC, but Gmail/Yahoo are increasingly strict for
"bulk senders". `p=none` only reports — it doesn't reject — so it's safe.

### 4. Create an API key

Resend dashboard → **API Keys** → **Create API Key** → name it `supabase-smtp`,
scope `Sending`, then copy the key (`re_...`). You only see it once.

### 5. Plug into Supabase

Supabase dashboard → **Project Settings** → **Authentication** → **SMTP Settings**:

| Field | Value |
|---|---|
| Enable Custom SMTP | ON |
| Sender name | `Frontendeasy` |
| Sender email | `noreply@yourdomain.com` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the API key from step 4 |

Hit **Save**.

---

## Option B — Brevo Free

### 1. Sign up

https://www.brevo.com → Sign up. Free tier: 9k emails / month, 300 / day.

### 2. Add and authenticate your sending domain

Brevo dashboard → **Senders, Domains & Dedicated IPs** → **Domains** →
**Add a Domain**. Brevo gives you three records to add at your DNS:

| Type | Host | Value |
|---|---|---|
| TXT  | `@`                  | `v=spf1 include:spf.brevo.com mx ~all` |
| TXT  | `mail._domainkey`    | (DKIM public key — long, copy exactly) |
| TXT  | `_dmarc`             | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Click **Authenticate** once the records propagate.

### 3. Add a verified sender address

**Senders** → **Add a sender** → use `noreply@yourdomain.com` — Brevo sends
a confirmation email; click the link to confirm.

### 4. Generate SMTP credentials

**SMTP & API** → **SMTP** tab → click **Generate a new SMTP key**. Brevo
shows the username (your account email) and a freshly-minted password.

### 5. Plug into Supabase

Supabase dashboard → **Project Settings** → **Authentication** → **SMTP Settings**:

| Field | Value |
|---|---|
| Enable Custom SMTP | ON |
| Sender name | `Frontendeasy` |
| Sender email | `noreply@yourdomain.com` (the address you verified in step 3) |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | your Brevo account email |
| Password | the SMTP key from step 4 |

Hit **Save**.

---

## Customise the email templates (optional but recommended)

Supabase dashboard → **Authentication** → **Email Templates**. Three templates
to override (the default Supabase markup is bland and gives away the stack):

- **Confirm signup** — for `signUpWithPassword`
- **Magic Link** — for `signInWithMagicLink`
- **Reset Password** — for `resetPassword`

Each template has access to `{{ .ConfirmationURL }}` (the click-through link).
Branding tip: keep the HTML simple — many inbox clients strip CSS aggressively;
a single hero color + the Frontendeasy "S" mark inline-styled is enough.

## Smoke test

After saving the SMTP settings:

1. Open the live app, click **Sign up**, use a real email address.
2. Confirmation email should arrive within ~30 seconds.
3. `From:` header should say `Frontendeasy <noreply@yourdomain.com>`.
4. Click the link — it should land on your production app and create the session.
5. Repeat with **Magic link** + **Forgot password** flows.
6. Inspect the email's headers — `SPF: pass` and `DKIM: pass` should be there.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Email not configured" error from Supabase | SMTP toggle still off — flip it ON and save again. |
| Emails delayed >5 minutes | Provider throttling on Free tier; usually catches up. |
| Emails land in spam | Missing or wrong DKIM record. Use https://www.mail-tester.com to debug. |
| Cert errors on port 465 | Resend requires SSL on 465. Don't use 587 with Resend. |
| Brevo emails rejected by Gmail | Add DMARC (Brevo step 2, last row). |

## Rotating credentials

If the SMTP key leaks (commit, logs, anywhere):

1. Provider dashboard → revoke the leaked key.
2. Generate a fresh one.
3. Paste into Supabase → Auth → SMTP → Save.

No app redeploy needed — Supabase reloads its SMTP config on save.

## Future: bumping past the free tier

When you outgrow the free quota:

- **Resend** → "Pro" plan: $20/month for 50k emails (best price/feature in the
  market right now).
- **Brevo** → "Starter" plan: $9/month for 5k emails — cheapest paid option.
- **SES (direct)** → ~$0.10 per 1k emails, but you manage the integration
  yourself.

Decision lever: if you stay <50k mails/month and want simple → Resend Pro.
If volume jumps past 100k/month → SES.
