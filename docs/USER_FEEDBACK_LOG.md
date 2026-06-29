# Frontendeasy user feedback log

Use this document to record first-user and demo-session feedback without collecting unnecessary personal data. Keep it product-focused, privacy-light, and safe to share internally.

## Privacy-light rules

- Do not store passwords, access tokens, API keys, cookies, recovery links, or private Supabase project details.
- Do not paste raw emails, phone numbers, Telegram handles, or full names unless the person explicitly asked to be contacted and consented to that exact note.
- Prefer coarse descriptors: `designer`, `founder`, `frontend dev`, `student`, `internal tester`.
- Redact screenshots before attaching them to issues; remove project names, private text, and customer assets when possible.
- If a user shares a project export, store only the minimum reproducible fixture or a sanitized description.
- Mark any sensitive value as `[REDACTED]`.

## Session template

Copy this block for each demo/interview/test session.

```md
### Session YYYY-MM-DD — short title

- Session type: demo / usability test / bug reproduction / onboarding call / async feedback
- Environment: local dev / preview deploy / production deploy / offline mode
- Browser + OS: Chrome / Safari / Firefox / Edge; macOS / Windows / Linux / iOS / Android
- Build/source: commit or release label; do not paste secrets
- Participant profile: role or segment only
- Consent/recording: none / notes only / recording stored at [REDACTED or safe link]
- Primary task: what the user tried to do
- Outcome: completed / completed with help / failed / abandoned
- Time to first useful result: approximate minutes

#### What happened

1. Step or observation.
2. Step or observation.
3. Step or observation.

#### User quotes

- "Short quote without private details."

#### Issues found

- Issue: concise title
  - Severity: blocker / high / medium / low / polish
  - Type: bug / UX friction / missing feature / performance / copy / docs / onboarding
  - Area: canvas / inspector / export / auth / cloud sync / assets / project list / docs / landing
  - Repro: steps or link to sanitized issue
  - Expected: expected behavior
  - Actual: actual behavior
  - Evidence: safe screenshot/log/fixture link or `[none]`
  - Owner/status: triage / planned / in progress / fixed / won't fix / deferred

#### Positive signals

- What worked clearly.
- Which value proposition landed.

#### Follow-up

- [ ] Send answer or workaround.
- [ ] File bug/issue.
- [ ] Add test/QA checklist item.
- [ ] Update docs/landing copy.
```

## Issue triage fields

Use these fields when promoting feedback into a formal task or issue.

- Title:
- Source session:
- Severity: blocker / high / medium / low / polish
- Frequency: once / repeated / common / unknown
- User impact: prevents export / loses data / blocks onboarding / slows workflow / visual confusion / nice-to-have
- Product area: canvas / inspector / left panel / topbar / export / project storage / cloud sync / auth / assets / snapshots / docs / landing
- Repro steps:
- Expected result:
- Actual result:
- Regression risk:
- Data-safety risk: none / possible local draft loss / possible cloud conflict / asset privacy / export corruption
- Suggested next action: fix now / add test / add docs / defer / close as duplicate
- Links: sanitized screenshots, logs, issues, PRs, or fixtures

## Severity guide

### Blocker

Prevents a user from completing a core flow or risks data loss/security exposure.

Examples:

- Project cannot open or save.
- Export produces unusable or unsafe files.
- Cloud conflict loses local edits without a recovery snapshot.
- Auth or asset flow exposes private data.

### High

Core flow works only with major friction or a common workaround.

Examples:

- New users cannot find export or project health.
- Canvas interaction repeatedly selects the wrong object.
- Large project becomes visibly unusable.

### Medium

Important but not immediately blocking.

Examples:

- Confusing label, missing empty-state explanation, unclear mode banner.
- Export quality warning is correct but hard to interpret.
- One browser has a non-critical layout issue.

### Low / polish

Small copy, visual, or convenience issue with low user impact.

## Feedback categories

- Activation: first-run comprehension, landing promise, template usefulness.
- Creation: drawing, editing, selection, inspector controls, keyboard shortcuts.
- Structure: pages/frames, layers, components/snippets, styles/variables.
- Export: generated HTML quality, filenames, assets, sitemap/robots/PWA files.
- Reliability: local save, offline behavior, cloud sync, conflicts, snapshots.
- Performance: startup, large canvas, drag/selection latency, export time.
- Trust: privacy, local-first clarity, cloud opt-in clarity, error recovery.
- Docs: deployment steps, QA checklists, SMTP/Supabase setup, export guide.

## Weekly feedback review

Use this lightweight review before planning the next batch:

1. Count sessions and completed tasks.
2. Group issues by product area and severity.
3. Identify repeated confusion in landing/onboarding copy.
4. Promote blockers/highs to queue items with acceptance criteria.
5. Convert repeated medium UX issues into small polish tasks.
6. Close or defer one-off requests that do not fit the product direction.
7. Update `docs/LANDING_BRIEF.md` only when feedback changes positioning or common objections.

## Running log

Add newest sessions at the top.

### Session YYYY-MM-DD — template placeholder

- Session type:
- Environment:
- Browser + OS:
- Build/source:
- Participant profile:
- Consent/recording:
- Primary task:
- Outcome:
- Time to first useful result:

#### What happened

1.

#### Issues found

- Issue:
  - Severity:
  - Type:
  - Area:
  - Repro:
  - Expected:
  - Actual:
  - Evidence:
  - Owner/status:

#### Positive signals

-

#### Follow-up

- [ ]
