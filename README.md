# a11y-audit-action

A free, open-source GitHub Action that runs automated WCAG 2.2 accessibility audits against rendered pages and posts beautiful PR comments with the results.

## Why this exists

There's a gap in the ecosystem. Existing solutions either cost money, only lint static code, or require complex setup:

| Solution | Free? | Scans rendered pages? | PR comments? | Zero-config? |
|----------|-------|-----------------------|--------------|--------------|
| Deque axe-devhub-action | No (paid) | Yes (needs Axe Watcher) | Yes | No |
| Deque axe-linter | Yes | No (static lint only) | Yes | Yes |
| GitHub accessibility-scanner | Yes (preview) | Yes | Creates issues, not comments | Moderate |
| Microsoft accessibility-insights-action | Yes | Yes | Annotations only | Moderate |
| A11yWatch Lite | Yes | Yes | Yes | No (needs CLI) |
| Level CI | No (SaaS) | Yes | Yes | Yes |
| **a11y-audit-action** | **Yes** | **Yes** | **Yes** | **Yes** |

**No free, open-source action** gives you: rendered page scanning + beautiful PR comments + WCAG 2.2 AA + zero config. That's the niche this fills.

## Features

- Scans fully rendered pages using Playwright + axe-core
- WCAG 2.2 AA conformance by default (configurable)
- Collapsible PR comments grouped by impact severity
- Auto-detects Vercel/Netlify preview URLs from `deployment_status` events
- Upserts comments on re-runs (no duplicates)
- Configurable impact threshold and fail behaviour
- GitHub Actions job summary for every run

## Quick start

### With explicit URLs

```yaml
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Floopion/a11y-audit-action@v1
        with:
          urls: https://your-site.com
```

### With Vercel preview URL (zero-config)

```yaml
on: deployment_status

permissions:
  contents: read
  pull-requests: write

jobs:
  a11y:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Floopion/a11y-audit-action@v1
```

> **Note:** The `pull-requests: write` permission is required for the action to post PR comments. Without it you'll get a "Resource not accessible by integration" error.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `urls` | *(auto-detect)* | Newline-separated URLs to audit |
| `wcag-level` | `wcag22aa` | WCAG conformance level (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) |
| `impact-threshold` | `serious` | Minimum impact to report: `minor` / `moderate` / `serious` / `critical` |
| `fail-on-violation` | `true` | Fail the check if violations are found |
| `comment` | `true` | Post a PR comment with results |
| `token` | `github.token` | GitHub token for commenting |

## Outputs

| Output | Description |
|--------|-------------|
| `violations-count` | Total number of violations found |
| `passes-count` | Total number of passing rules |
| `result-json` | Full axe-core results as JSON |

## How it works

```
  PR opened / Deploy succeeded
            │
            ▼
  ┌─────────────────────┐
  │   Resolve URLs      │  Explicit input or auto-detect
  │   (config.ts)       │  from Vercel/Netlify preview
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Launch Chromium   │  Headless via Playwright
  │   (scanner.ts)      │
  └─────────┬───────────┘
            │
            ▼           ┌───────────────────────┐
  ┌─────────────────┐   │  For each URL:        │
  │   Navigate page  │──│  networkidle (30s)    │
  │   Run axe-core   │  │  fallback: DOMready   │
  └─────────┬───────┘   └───────────────────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Filter violations │  By WCAG level + impact
  │   (config.ts)       │  threshold (cumulative tags)
  └─────────┬───────────┘
            │
        ┌───┴───┐
        ▼       ▼
  ┌──────────┐ ┌──────────────┐
  │ Job      │ │ PR Comment   │  Collapsible sections
  │ Summary  │ │ (comment.ts) │  grouped by severity
  └──────────┘ └──────┬───────┘
                      │
                      ▼
               ┌─────────────┐
               │ Upsert via  │  Find by marker or
               │ GitHub API  │  create new comment
               │ (github.ts) │
               └──────┬──────┘
                      │
                      ▼
               Pass or Fail ✓✗
```

## Roadmap

- **v1** — Core scanning, PR comments, job summaries, preview URL detection *(in progress)*
- **v2 — Baseline mode** — Store known violations in `.a11y-baseline.json` so PRs only report regressions, not pre-existing debt. Essential for adopting in large codebases
- **v2 — Multi-page crawl** — Given a single entry URL, spider the site and audit discovered pages
- **v2 — Historical trend tracking** — Track violation counts over time and surface regressions in PR comments
- **v2 — AI fix suggestions** — axe-core's generic "how to fix" text is useful but not actionable. An optional LLM pass could examine the actual HTML snippet against the WCAG criterion and generate a specific, copy-pasteable fix (e.g. "Change `<div onclick>` to `<button>` and add `aria-label='Submit form'`"). Opt-in via `ai-suggestions: true`.

## Licence

[MIT](./LICENSE)
