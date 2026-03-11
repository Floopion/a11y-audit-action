import * as core from '@actions/core';
import { chromium, type Browser, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { resolveWcagTags, meetsImpactThreshold } from './config';
import type { ActionInputs, AuditResult, PageResult } from './types';

const NAV_TIMEOUT = 30_000;

async function navigatePage(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    return true;
  } catch {
    core.warning(`Timed out waiting for networkidle on ${url}, falling back to domcontentloaded`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      return true;
    } catch {
      core.warning(`Failed to load ${url} — skipping`);
      return false;
    }
  }
}

async function scanPage(page: Page, url: string, tags: string[], threshold: ActionInputs['impactThreshold'], scope?: string): Promise<PageResult | null> {
  core.info(`Scanning ${url}...`);

  const loaded = await navigatePage(page, url);
  if (!loaded) return null;

  let builder = new AxeBuilder({ page }).withTags(tags);
  if (scope) builder = builder.include(scope);
  const results = await builder.analyze();
  const violations = results.violations.filter((v) => meetsImpactThreshold(v.impact ?? undefined, threshold));

  return {
    url,
    violations,
    passes: results.passes,
    incomplete: results.incomplete,
    inapplicable: results.inapplicable,
  };
}

function normaliseUrl(href: string, origin: string): string | null {
  try {
    const parsed = new URL(href, origin);
    if (parsed.origin !== origin) return null;
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    parsed.search = '';
    return parsed.href;
  } catch {
    return null;
  }
}

async function discoverLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map((a) => a.getAttribute('href') ?? ''),
  );

  const urls = new Set<string>();
  for (const href of hrefs) {
    const normalised = normaliseUrl(href, origin);
    if (normalised) urls.add(normalised);
  }
  return [...urls];
}

export async function runAudit(inputs: ActionInputs): Promise<AuditResult> {
  const tags = resolveWcagTags(inputs.wcagLevel);
  core.info(`WCAG tags: ${tags.join(', ')}`);
  core.info(`Impact threshold: ${inputs.impactThreshold}`);
  if (inputs.auditScope) core.info(`Audit scope: ${inputs.auditScope}`);
  if (inputs.crawl) {
    core.info(`Crawl enabled — max ${inputs.maxPages} pages`);
  }

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const results: PageResult[] = [];
    const visited = new Set<string>();
    const queue: string[] = [...inputs.urls];

    while (queue.length > 0 && results.length < (inputs.crawl ? inputs.maxPages : inputs.urls.length)) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const result = await scanPage(page, url, tags, inputs.impactThreshold, inputs.auditScope);
        if (result) results.push(result);

        if (inputs.crawl && results.length < inputs.maxPages) {
          const origin = new URL(url).origin;
          const links = await discoverLinks(page, origin);
          for (const link of links) {
            if (!visited.has(link)) queue.push(link);
          }
        }
      } finally {
        await context.close();
      }
    }

    if (inputs.crawl) {
      core.info(`Crawl complete — scanned ${results.length} page${results.length === 1 ? '' : 's'}`);
    }

    const totalViolations = results.reduce((sum, p) => sum + p.violations.length, 0);
    const totalPasses = results.reduce((sum, p) => sum + p.passes.length, 0);

    return { pages: results, totalViolations, totalPasses };
  } finally {
    await browser?.close();
  }
}
