import * as core from '@actions/core';
import { parseInputs } from './config';
import { runAudit } from './scanner';
import { formatComment, formatJobSummary } from './comment';
import { resolvePrNumber, upsertComment } from './github';

async function run(): Promise<void> {
  const inputs = parseInputs();

  core.info(`Auditing ${inputs.urls.length} URL${inputs.urls.length === 1 ? '' : 's'}...`);
  const result = await runAudit(inputs);

  core.setOutput('violations-count', result.totalViolations.toString());
  core.setOutput('passes-count', result.totalPasses.toString());
  core.setOutput('result-json', JSON.stringify(result));

  // Job summary — always written
  const summary = formatJobSummary(result, inputs.wcagLevel);
  await core.summary.addRaw(summary).write();

  // PR comment
  if (inputs.comment) {
    const prNumber = await resolvePrNumber(inputs.token);
    if (prNumber) {
      const commentBody = formatComment(result, inputs.wcagLevel);
      await upsertComment(inputs.token, prNumber, commentBody);
      core.info(`Posted audit results to PR #${prNumber}`);
    } else {
      core.warning('Could not determine PR number — skipping comment');
    }
  }

  // Fail check
  if (inputs.failOnViolation && result.totalViolations > 0) {
    core.setFailed(
      `Accessibility audit found ${result.totalViolations} violation${result.totalViolations === 1 ? '' : 's'}`,
    );
  }
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
