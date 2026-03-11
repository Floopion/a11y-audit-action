import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import type { Result } from 'axe-core';
import type { ActionInputs, AiSuggestionsMap, PageResult } from './types';

const MAX_HTML_LENGTH = 300;
const MAX_VIOLATIONS_PER_BATCH = 15;

function resolveActionPath(): string {
  return process.env.GITHUB_ACTION_PATH || path.resolve(__dirname, '..');
}

function loadDefaultPrompt(): string {
  const promptPath = path.join(resolveActionPath(), 'prompts', 'default.md');
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    core.warning(`Could not read default prompt at ${promptPath} — using fallback`);
    return 'You are an accessibility expert. Generate specific, copy-pasteable fixes for each WCAG violation.';
  }
}

function loadSystemPrompt(promptFile: string): string {
  const defaultPrompt = loadDefaultPrompt();

  if (!promptFile) return defaultPrompt;

  try {
    const userPrompt = fs.readFileSync(promptFile, 'utf-8');
    return `${defaultPrompt}\n\n## Project-specific guidance\n\n${userPrompt}`;
  } catch {
    core.warning(`Could not read ai-prompt-file at ${promptFile} — using default prompt`);
    return defaultPrompt;
  }
}

function buildViolationContext(violation: Result): string {
  const tags = violation.tags.filter((t) => t.startsWith('wcag')).join(', ');
  const nodes = violation.nodes.slice(0, 3);
  const snippets = nodes
    .map((n) => {
      const html = (n.html ?? '').slice(0, MAX_HTML_LENGTH);
      return `  - \`${n.target.join(' > ')}\`\n    \`\`\`html\n    ${html}\n    \`\`\`\n    ${n.failureSummary ?? ''}`;
    })
    .join('\n');

  let ctx = `### ${violation.id} (${violation.impact ?? 'unknown'})\n`;
  ctx += `${violation.help}\n`;
  if (tags) ctx += `WCAG: ${tags}\n`;
  ctx += `Failing elements:\n${snippets}`;
  if (violation.nodes.length > 3) {
    ctx += `\n...and ${violation.nodes.length - 3} more elements with the same issue`;
  }
  return ctx;
}

function buildPagePrompt(page: PageResult): string {
  const violations = page.violations.slice(0, MAX_VIOLATIONS_PER_BATCH);
  const sections = violations.map(buildViolationContext).join('\n\n');
  return `## Page: ${page.url}\n\n${sections}`;
}

function parseSuggestions(response: string, violations: Result[]): Map<string, string> {
  const suggestions = new Map<string, string>();

  for (const violation of violations) {
    const ruleId = violation.id;
    const pattern = new RegExp(`###?\\s*${ruleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=###?\\s|$)`, 'i');
    const match = response.match(pattern);
    if (match) {
      suggestions.set(ruleId, match[0].trim());
    }
  }

  if (suggestions.size === 0 && response.trim()) {
    const firstRuleId = violations[0]?.id;
    if (firstRuleId) {
      suggestions.set(firstRuleId, response.trim());
    }
  }

  return suggestions;
}

export async function generateSuggestions(
  pages: PageResult[],
  inputs: ActionInputs,
): Promise<AiSuggestionsMap> {
  const suggestionsMap: AiSuggestionsMap = new Map();

  if (!inputs.aiApiKey) {
    core.info('No ai-api-key provided — skipping AI suggestions');
    return suggestionsMap;
  }

  const pagesWithViolations = pages.filter((p) => p.violations.length > 0);
  if (pagesWithViolations.length === 0) return suggestionsMap;

  core.info(`Generating AI fix suggestions for ${pagesWithViolations.length} page(s)...`);

  const client = new OpenAI({
    apiKey: inputs.aiApiKey,
    baseURL: inputs.aiBaseUrl,
  });

  const systemPrompt = loadSystemPrompt(inputs.aiPromptFile);

  for (const page of pagesWithViolations) {
    const userPrompt = buildPagePrompt(page);

    try {
      const response = await client.chat.completions.create({
        model: inputs.aiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const pageSuggestions = parseSuggestions(content, page.violations);
        suggestionsMap.set(page.url, pageSuggestions);
        core.info(`  ${page.url}: ${pageSuggestions.size} suggestion(s)`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.warning(`AI suggestions failed for ${page.url}: ${msg}`);
    }
  }

  core.info(`AI suggestions complete — ${suggestionsMap.size} page(s) processed`);
  return suggestionsMap;
}
