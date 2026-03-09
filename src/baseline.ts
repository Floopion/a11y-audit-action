import * as core from '@actions/core';
import * as fs from 'fs';
import type { Result } from 'axe-core';
import type { AuditResult, BaselineEntry, BaselineFile, BaselineResult, PageResult } from './types';

function fingerprint(ruleId: string, selector: string): string {
  return `${ruleId}::${selector}`;
}

function extractFingerprints(entries: BaselineEntry[]): Set<string> {
  return new Set(entries.map((e) => fingerprint(e.ruleId, e.selector)));
}

export function loadBaseline(path: string): BaselineFile | null {
  if (!path) return null;

  try {
    const content = fs.readFileSync(path, 'utf-8');
    const data = JSON.parse(content) as BaselineFile;

    if (data.version !== 1 || !Array.isArray(data.entries)) {
      core.warning(`Invalid baseline file format at ${path} — ignoring`);
      return null;
    }

    core.info(`Loaded baseline with ${data.entries.length} known violations from ${path}`);
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      core.info(`No baseline file found at ${path} — treating all violations as new`);
      return null;
    }
    core.warning(`Failed to read baseline file at ${path}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function violationToEntries(violation: Result): BaselineEntry[] {
  return violation.nodes.map((node) => ({
    ruleId: violation.id,
    selector: node.target.join(' > '),
    impact: violation.impact ?? 'unknown',
  }));
}

export function applyBaseline(result: AuditResult, baseline: BaselineFile | null): BaselineResult {
  if (!baseline) {
    return {
      newViolations: result.totalViolations,
      baselineViolations: 0,
      newPages: result.pages,
    };
  }

  const known = extractFingerprints(baseline.entries);
  let newViolations = 0;
  let baselineViolations = 0;
  const newPages: PageResult[] = [];

  for (const page of result.pages) {
    const newPageViolations: Result[] = [];

    for (const violation of page.violations) {
      const newNodes = violation.nodes.filter(
        (node) => !known.has(fingerprint(violation.id, node.target.join(' > '))),
      );
      const baselineNodes = violation.nodes.length - newNodes.length;
      baselineViolations += baselineNodes;

      if (newNodes.length > 0) {
        newViolations++;
        newPageViolations.push({ ...violation, nodes: newNodes });
      } else if (baselineNodes > 0) {
        baselineViolations++;
      }
    }

    newPages.push({
      ...page,
      violations: newPageViolations,
    });
  }

  core.info(`Baseline: ${baselineViolations} known, ${newViolations} new`);
  return { newViolations, baselineViolations, newPages };
}

export function generateBaseline(result: AuditResult): BaselineFile {
  const entries: BaselineEntry[] = [];

  for (const page of result.pages) {
    for (const violation of page.violations) {
      entries.push(...violationToEntries(violation));
    }
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    entries,
  };
}
