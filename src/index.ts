import * as core from '@actions/core';
import { parseInputs } from './config';
import { runAudit } from './scanner';
import { formatComment, formatJobSummary } from './comment';
import { resolvePrNumber, upsertComment } from './github';
import { loadBaseline, applyBaseline, generateBaseline } from './baseline';
import { generateSuggestions } from './suggestions';

async function run(): Promise<void> {
  const inputs = parseInputs();

  core.info(`Auditing ${inputs.urls.length} URL${inputs.urls.length === 1 ? '' : 's'}...`);
  const result = await runAudit(inputs);

  // Baseline comparison
  const baseline = loadBaseline(inputs.baselinePath);
  const baselineResult = applyBaseline(result, baseline);
  const effectiveViolations = baselineResult.newViolations;

  core.setOutput('violations-count', effectiveViolations.toString());
  core.setOutput('passes-count', result.totalPasses.toString());
  core.setOutput('result-json', JSON.stringify(result));
  core.setOutput('new-violations-count', baselineResult.newViolations.toString());
  core.setOutput('baseline-violations-count', baselineResult.baselineViolations.toString());
  core.setOutput('baseline-json', JSON.stringify(generateBaseline(result)));

  // AI suggestions — only for new violations, per-page batched
  const effectivePages = baselineResult ? baselineResult.newPages : result.pages;
  const suggestions = await generateSuggestions(effectivePages, inputs);

  // Job summary — always written
  const summary = formatJobSummary(result, inputs.wcagLevel);
  await core.summary.addRaw(summary).write();

  // PR comment
  if (inputs.comment) {
    const prNumber = await resolvePrNumber(inputs.token);
    if (prNumber) {
      const commentBody = formatComment(result, inputs.wcagLevel, baselineResult, suggestions);
      await upsertComment(inputs.token, prNumber, commentBody);
      core.info(`Posted audit results to PR #${prNumber}`);
    } else {
      core.warning('Could not determine PR number — skipping comment');
    }
  }

  // Fail check — only on new violations (not baseline)
  if (inputs.failOnViolation && effectiveViolations > 0) {
    core.setFailed(
      `Accessibility audit found ${effectiveViolations} new violation${effectiveViolations === 1 ? '' : 's'}`,
    );
  }
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
