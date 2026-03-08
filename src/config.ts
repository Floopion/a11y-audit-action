import * as core from '@actions/core';
import type { ActionInputs, ImpactLevel, WcagLevel } from './types';

const WCAG_TAG_MAP: Record<WcagLevel, string[]> = {
  wcag2a: ['wcag2a'],
  wcag2aa: ['wcag2a', 'wcag2aa'],
  wcag21aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  wcag22aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
};

const IMPACT_SEVERITY: Record<ImpactLevel, number> = {
  minor: 0,
  moderate: 1,
  serious: 2,
  critical: 3,
};

export function resolveWcagTags(level: WcagLevel): string[] {
  const tags = WCAG_TAG_MAP[level];
  if (!tags) {
    throw new Error(`Unknown WCAG level: ${level}. Expected one of: ${Object.keys(WCAG_TAG_MAP).join(', ')}`);
  }
  return tags;
}

export function meetsImpactThreshold(impact: string | undefined, threshold: ImpactLevel): boolean {
  if (!impact) return false;
  return IMPACT_SEVERITY[impact as ImpactLevel] >= IMPACT_SEVERITY[threshold];
}

function detectPreviewUrl(): string | undefined {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName !== 'deployment_status') return undefined;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const event = require(eventPath);
    const url =
      event?.deployment_status?.environment_url ||
      event?.deployment_status?.target_url ||
      event?.deployment?.payload?.web_url;

    if (url && typeof url === 'string') {
      core.info(`Auto-detected preview URL: ${url}`);
      return url;
    }
  } catch {
    core.warning('Failed to read deployment event payload for URL detection');
  }

  return undefined;
}

export function parseInputs(): ActionInputs {
  const rawUrls = core.getInput('urls');
  let urls: string[];

  if (rawUrls) {
    urls = rawUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
  } else {
    const previewUrl = detectPreviewUrl();
    if (previewUrl) {
      urls = [previewUrl];
    } else {
      throw new Error(
        'No URLs provided and could not auto-detect a preview URL. ' +
          'Either set the `urls` input or trigger on `deployment_status`.',
      );
    }
  }

  const wcagLevel = (core.getInput('wcag-level') || 'wcag22aa') as WcagLevel;
  if (!WCAG_TAG_MAP[wcagLevel]) {
    throw new Error(`Invalid wcag-level: ${wcagLevel}`);
  }

  const impactThreshold = (core.getInput('impact-threshold') || 'serious') as ImpactLevel;
  if (!(impactThreshold in IMPACT_SEVERITY)) {
    throw new Error(`Invalid impact-threshold: ${impactThreshold}`);
  }

  return {
    urls,
    wcagLevel,
    impactThreshold,
    failOnViolation: core.getBooleanInput('fail-on-violation'),
    comment: core.getBooleanInput('comment'),
    token: core.getInput('token'),
  };
}
