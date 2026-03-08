import * as core from '@actions/core';
import * as github from '@actions/github';
import { COMMENT_MARKER } from './comment';

type Octokit = ReturnType<typeof github.getOctokit>;

export function getPrNumber(): number | undefined {
  const payload = github.context.payload;

  // Direct PR event
  if (payload.pull_request?.number) {
    return payload.pull_request.number;
  }

  return undefined;
}

export async function findPrForCommit(octokit: Octokit): Promise<number | undefined> {
  const { owner, repo } = github.context.repo;
  const sha = github.context.sha;

  try {
    const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: sha,
    });

    const openPr = prs.find((pr) => pr.state === 'open');
    if (openPr) {
      core.info(`Found open PR #${openPr.number} for commit ${sha}`);
      return openPr.number;
    }
  } catch {
    core.warning(`Could not look up PRs for commit ${sha}`);
  }

  return undefined;
}

export async function upsertComment(token: string, prNumber: number, body: string): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    core.info(`Updating existing comment #${existing.id}`);
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    core.info(`Creating new comment on PR #${prNumber}`);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

export async function resolvePrNumber(token: string): Promise<number | undefined> {
  const direct = getPrNumber();
  if (direct) return direct;

  const octokit = github.getOctokit(token);
  return findPrForCommit(octokit);
}
