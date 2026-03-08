import type { Result } from 'axe-core';
import type { AuditResult, ImpactLevel, WcagLevel } from './types';

const COMMENT_MARKER = '<!-- a11y-audit-action -->';
const MAX_COMMENT_LENGTH = 60_000;
const MAX_NODES_PER_VIOLATION = 5;
const MAX_HTML_LENGTH = 100;

const IMPACT_EMOJI: Record<string, string> = {
  critical: '🔴',
  serious: '🟠',
  moderate: '🟡',
  minor: '🔵',
};

const IMPACT_ORDER: ImpactLevel[] = ['critical', 'serious', 'moderate', 'minor'];

export { COMMENT_MARKER };

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatViolation(violation: Result): string {
  const impact = violation.impact ?? 'unknown';
  const emoji = IMPACT_EMOJI[impact] ?? '⚪';
  const tags = violation.tags.filter((t) => t.startsWith('wcag')).join(', ');
  const nodes = violation.nodes.slice(0, MAX_NODES_PER_VIOLATION);

  let md = `#### ${emoji} ${violation.id}\n\n`;
  md += `**${violation.help}**`;
  if (tags) md += ` (${tags})`;
  md += '\n\n';

  if (violation.helpUrl) {
    md += `[Learn more](${violation.helpUrl})\n\n`;
  }

  md += '| Element | Fix |\n|---------|-----|\n';
  for (const node of nodes) {
    const selector = `\`${truncate(node.target.join(' > '), MAX_HTML_LENGTH)}\``;
    const fix = node.failureSummary?.split('\n')[0] ?? '';
    md += `| ${selector} | ${fix} |\n`;
  }

  if (violation.nodes.length > MAX_NODES_PER_VIOLATION) {
    md += `\n*...and ${violation.nodes.length - MAX_NODES_PER_VIOLATION} more elements*\n`;
  }

  return md;
}

function groupByImpact(violations: Result[]): Map<string, Result[]> {
  const grouped = new Map<string, Result[]>();
  for (const level of IMPACT_ORDER) {
    const matches = violations.filter((v) => v.impact === level);
    if (matches.length > 0) grouped.set(level, matches);
  }
  return grouped;
}

export function formatComment(result: AuditResult, wcagLevel: WcagLevel): string {
  const allViolations = result.pages.flatMap((p) => p.violations);
  const passed = result.totalViolations === 0;

  let md = `${COMMENT_MARKER}\n`;
  md += passed
    ? `## ✅ Accessibility audit passed\n\n`
    : `## ❌ Accessibility audit found ${result.totalViolations} violation${result.totalViolations === 1 ? '' : 's'}\n\n`;

  md += `**${result.pages.length} page${result.pages.length === 1 ? '' : 's'}** scanned · `;
  md += `**${result.totalPasses}** rules passed · `;
  md += `**${result.totalViolations}** violation${result.totalViolations === 1 ? '' : 's'} · `;
  md += `WCAG level: \`${wcagLevel}\`\n\n`;

  if (passed) {
    md += 'No accessibility violations found. Nice work!\n';
    return md;
  }

  // Group violations by page, then by impact
  for (const page of result.pages) {
    if (page.violations.length === 0) continue;

    if (result.pages.length > 1) {
      md += `### 📄 ${page.url}\n\n`;
    }

    const grouped = groupByImpact(page.violations);

    for (const [impact, violations] of grouped) {
      const emoji = IMPACT_EMOJI[impact] ?? '⚪';
      md += `<details>\n<summary>${emoji} <strong>${impact.charAt(0).toUpperCase() + impact.slice(1)}</strong> — ${violations.length} violation${violations.length === 1 ? '' : 's'}</summary>\n\n`;

      for (const v of violations) {
        md += formatViolation(v) + '\n';
      }

      md += `</details>\n\n`;
    }
  }

  if (md.length > MAX_COMMENT_LENGTH) {
    md = md.slice(0, MAX_COMMENT_LENGTH) + '\n\n*...output truncated to fit GitHub comment limits*\n';
  }

  return md;
}

export function formatJobSummary(result: AuditResult, wcagLevel: WcagLevel): string {
  let md = `## Accessibility Audit Results\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Pages scanned | ${result.pages.length} |\n`;
  md += `| Rules passed | ${result.totalPasses} |\n`;
  md += `| Violations | ${result.totalViolations} |\n`;
  md += `| WCAG level | ${wcagLevel} |\n\n`;

  for (const page of result.pages) {
    md += `### ${page.url}\n\n`;
    if (page.violations.length === 0) {
      md += 'No violations found.\n\n';
      continue;
    }

    md += `| Rule | Impact | Elements |\n|------|--------|----------|\n`;
    for (const v of page.violations) {
      md += `| ${v.id} | ${v.impact ?? 'unknown'} | ${v.nodes.length} |\n`;
    }
    md += '\n';
  }

  return md;
}
