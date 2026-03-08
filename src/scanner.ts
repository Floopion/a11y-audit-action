import * as core from '@actions/core';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { resolveWcagTags, meetsImpactThreshold } from './config';
import type { ActionInputs, AuditResult, PageResult } from './types';

const NAV_TIMEOUT = 30_000;

async function scanPage(page: Page, url: string, tags: string[], threshold: ActionInputs['impactThreshold']): Promise<PageResult | null> {
  core.info(`Scanning ${url}...`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
  } catch {
    core.warning(`Timed out waiting for networkidle on ${url}, falling back to domcontentloaded`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    } catch {
      core.warning(`Failed to load ${url} — skipping`);
      return null;
    }
  }

  const results = await new AxeBuilder({ page }).withTags(tags).analyze();

  const violations = results.violations.filter((v) => meetsImpactThreshold(v.impact ?? undefined, threshold));

  return {
    url,
    violations,
    passes: results.passes,
    incomplete: results.incomplete,
    inapplicable: results.inapplicable,
  };
}

export async function runAudit(inputs: ActionInputs): Promise<AuditResult> {
  const tags = resolveWcagTags(inputs.wcagLevel);
  core.info(`WCAG tags: ${tags.join(', ')}`);
  core.info(`Impact threshold: ${inputs.impactThreshold}`);

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const pages: PageResult[] = [];

    for (const url of inputs.urls) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const result = await scanPage(page, url, tags, inputs.impactThreshold);
        if (result) pages.push(result);
      } finally {
        await context.close();
      }
    }

    const totalViolations = pages.reduce((sum, p) => sum + p.violations.length, 0);
    const totalPasses = pages.reduce((sum, p) => sum + p.passes.length, 0);

    return { pages, totalViolations, totalPasses };
  } finally {
    await browser?.close();
  }
}
