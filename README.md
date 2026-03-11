# a11y-audit-action

A free, open-source GitHub Action that runs automated WCAG 2.2 accessibility audits against rendered pages and posts results directly to your PR.

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

**No free, open-source action** gives you: rendered page scanning + PR comments + WCAG 2.2 AA + zero config. That's the niche this fills.

## Features

- Scans fully rendered pages using Playwright + axe-core
- WCAG 2.2 AA conformance by default (configurable)
- **Multi-page crawl** — spider same-origin links from a seed URL
- **Baseline mode** — track known violations so PRs only report regressions
- **AI fix suggestions** — optional LLM-powered fixes via any OpenAI-compatible provider
- **Audit scope** — CSS selector scoping for micro frontend architectures
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

### With multi-page crawl

```yaml
- uses: Floopion/a11y-audit-action@v1
  with:
    urls: https://your-site.com
    crawl: true
    max-pages: 20
```

The crawler starts from your seed URL(s), discovers same-origin links, and audits each page — up to `max-pages`.

### With baseline mode

Track known violations so only **new** regressions fail the build:

```yaml
- uses: Floopion/a11y-audit-action@v1
  with:
    urls: https://your-site.com
    baseline: .a11y-baseline.json
```

On the first run, the action creates the baseline file. On subsequent runs, only violations **not** in the baseline are reported as new. Commit the baseline file to your repo and update it as you fix issues.

### With AI fix suggestions

Get specific, copy-pasteable fixes for each violation powered by any OpenAI-compatible LLM:

```yaml
- uses: Floopion/a11y-audit-action@v1
  with:
    urls: https://your-site.com
    ai-api-key: ${{ secrets.AI_API_KEY }}
    ai-model: gpt-4o-mini
```

The `ai-api-key` input is optional. If omitted, the action runs normally without AI suggestions — no errors, no warnings.

#### Supported providers

Any provider with an OpenAI-compatible chat completions endpoint works. Pass the provider's base URL via `ai-base-url`:

| Provider | `ai-base-url` | `ai-model` example |
|----------|---------------|--------------------|
| OpenAI | *(default)* | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1/` | `claude-sonnet-4-6` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Grok (xAI) | `https://api.x.ai/v1` | `grok-3-mini` |
| GitHub Models | `https://models.github.ai/inference` | `openai/gpt-4o` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4-6` |
| Ollama (local) | `http://localhost:11434/v1/` | `llama3` |

#### Custom prompt file

Append project-specific guidance to the built-in prompt:

```yaml
- uses: Floopion/a11y-audit-action@v1
  with:
    urls: https://your-site.com
    ai-api-key: ${{ secrets.AI_API_KEY }}
    ai-prompt-file: .a11y-prompt.md
```

Example `.a11y-prompt.md`:
```markdown
- We use React Aria components — prefer <Button> over adding aria-* to raw HTML
- Our design tokens are in Tailwind — use semantic classes, not hex values
- Use our `visually-hidden` utility class, not `sr-only`
```

> **Security:** Always pass your API key via `${{ secrets.YOUR_SECRET }}`, never hardcoded. The action masks the key from logs via `core.setSecret()`. Do not use this action with `pull_request_target` if you checkout untrusted PR code — fork PRs could exfiltrate secrets. Use `pull_request` instead.

### With audit scope (micro frontends)

In micro frontend architectures, multiple apps share a page — a shell provides the nav, header, and footer while each app renders into its own root element. Without scoping, every app's audit would flag the same shell violations.

Use `audit-scope` to restrict the audit to your app's DOM subtree:

```yaml
- uses: Floopion/a11y-audit-action@v1
  with:
    urls: https://staging.example.com/dashboard
    audit-scope: '#dashboard-root'
    baseline: .a11y-baseline.json
```

Only elements inside `#dashboard-root` are analysed. The shell team runs their own unscoped audit to cover the shared UI.

This works with any CSS selector — IDs, classes, data attributes:

```yaml
audit-scope: '[data-app="reporting"]'
audit-scope: '.my-app-container'
audit-scope: '#root > main'
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `urls` | *(auto-detect)* | Newline-separated URLs to audit |
| `wcag-level` | `wcag22aa` | WCAG conformance level (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) |
| `impact-threshold` | `serious` | Minimum impact to report: `minor` / `moderate` / `serious` / `critical` |
| `fail-on-violation` | `true` | Fail the check if violations are found |
| `comment` | `true` | Post a PR comment with results |
| `baseline` | *(none)* | Path to baseline JSON file — only new violations are reported |
| `crawl` | `false` | Crawl same-origin links discovered on each page |
| `max-pages` | `10` | Maximum pages to scan when crawling |
| `audit-scope` | *(entire page)* | CSS selector to scope the audit to a DOM subtree |
| `ai-api-key` | *(none)* | API key for an OpenAI-compatible LLM provider. If omitted, AI suggestions are skipped |
| `ai-base-url` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `ai-model` | `gpt-4o-mini` | Model name for AI suggestions |
| `ai-prompt-file` | *(none)* | Path to a custom prompt file for project-specific guidance |
| `token` | `github.token` | GitHub token for commenting |

## Outputs

| Output | Description |
|--------|-------------|
| `violations-count` | Total number of violations found (excludes baseline) |
| `passes-count` | Total number of passing rules |
| `result-json` | Full axe-core results as JSON |
| `new-violations-count` | Violations not in baseline |
| `baseline-violations-count` | Violations matched to baseline |
| `baseline-json` | Updated baseline JSON (pipe to a file to update your baseline) |

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
  │   (audit-scope?) │  │  scope to CSS selector│
  └─────────┬───────┘   └───────────────────────┘
            │
            ├── crawl: true? ──▶ Discover same-origin
            │                    links, enqueue up to
            │                    max-pages, loop ▲
            ▼
  ┌─────────────────────┐
  │   Filter violations │  By WCAG level + impact
  │   (config.ts)       │  threshold (cumulative tags)
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Baseline compare  │  baseline set? compare
  │   (baseline.ts)     │  fingerprints, separate
  └─────────┬───────────┘  new vs known violations
            │
            ├── ai-api-key set? ──▶ LLM generates
            │   (suggestions.ts)     copy-pasteable fixes
            │                        per page (batched)
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
         (only new violations fail)
```

## Roadmap

- ~~**v1.0** — Core scanning, PR comments, job summaries, preview URL detection~~ ✓
- ~~**v1.1 — Baseline mode** — Store known violations in `.a11y-baseline.json` so PRs only report regressions~~ ✓
- ~~**v1.1 — Multi-page crawl** — BFS spider from seed URLs, same-origin, configurable depth~~ ✓
- ~~**v1.2 — AI fix suggestions** — LLM-powered fixes via any OpenAI-compatible provider, scoped to active WCAG level~~ ✓
- ~~**v1.3 — Audit scope** — CSS selector scoping for micro frontend architectures~~ ✓

## Licence

[MIT](./LICENSE)
