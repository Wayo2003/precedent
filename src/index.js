// Entry points of the Precedent Forge app.
//  - `handler`: backend resolvers for the UI Kit pages (called with invoke() from @forge/bridge)
//  - the other exports are actions. The same actions serve two audiences:
//      * the "Precedent" Rovo agent (rovo:agent module)
//      * any MCP client, e.g. Claude Code or Cursor (rovo:mcp module), so coding agents check the
//        team's decisions before they write code.

import Resolver from '@forge/resolver';
import { loadAdrs, readIssue, openIssues, recordDecision, comment, seedDemo } from './lib/atlassian.js';
import { check, search, describeAdr, describeFindings } from './lib/decisions.js';

// ---------------------------------------------------------------- UI resolvers

const resolver = new Resolver();

// Project page: the decision log plus every open issue that reopens / touches a decision.
resolver.define('getOverview', async ({ context }) => {
  const projectKey = context.extension?.project?.key;
  const [{ log, adrs }, issues] = await Promise.all([loadAdrs(), openIssues(projectKey)]);
  const flagged = issues
    .map((i) => ({ ...i, findings: check(i.text, adrs) }))
    .filter((i) => i.findings.some((f) => f.kind !== 'related'))
    .map(({ text, ...i }) => i);
  return { projectKey, siteUrl: context.siteUrl, logUrl: log?._links?.webui || null, adrs, flagged };
});

// Issue panel: decisions this issue reopens, relies on, or relates to.
resolver.define('getIssueFindings', async ({ context }) => {
  const key = context.extension?.issue?.key;
  const [{ adrs }, issue] = await Promise.all([loadAdrs(), readIssue(key)]);
  return { key, count: adrs.length, findings: check(issue.text, adrs) };
});

// Post the findings as a Jira comment so the whole team sees them.
resolver.define('warnIssue', async ({ payload, context }) => {
  const key = payload?.issueKey || context.extension?.issue?.key;
  const [{ adrs }, issue] = await Promise.all([loadAdrs(), readIssue(key)]);
  const findings = check(issue.text, adrs).filter((f) => f.kind !== 'related');
  if (!findings.length) return { posted: false };
  await comment(key, `Precedent: ${describeFindings(findings, 'this issue')}\nIf the decision should change, record a new ADR that supersedes it.`);
  return { posted: true, count: findings.length };
});

resolver.define('seedDemo', async ({ payload, context }) => seedDemo(context.extension?.project?.key, payload?.phase, payload?.spaceKey));

export const handler = resolver.getDefinitions();

// ---------------------------------------------------------------- actions (Rovo agent + MCP tools)

const safe = (fn) => async (payload) => {
  try {
    return await fn(payload || {});
  } catch (e) {
    console.error(e);
    return `Error: ${e.message}`;
  }
};

// "What did we decide about X?"
export const findDecisions = safe(async ({ query }) => {
  const { adrs } = await loadAdrs();
  if (!adrs.length) return 'No decisions recorded yet. Create a Confluence page titled "Decision Log" with ADR child pages, or record one with record-decision.';
  const hits = query ? search(query, adrs) : adrs;
  return hits.length ? hits.map(describeAdr).join('\n') : `No recorded decision matches "${query}".`;
});

// The full decision log, one line per ADR.
export const decisionLog = safe(async () => {
  const { adrs } = await loadAdrs();
  return adrs.length ? adrs.map((a) => `${a.key} [${a.status}${a.supersededBy ? ` by ${a.supersededBy}` : ''}] ${a.title} (${a.date}, ${a.owner})`).join('\n') : 'No decisions recorded yet.';
});

// For coding agents and humans: "I am about to <plan>" -> conflicts with past decisions.
export const checkPlan = safe(async ({ plan }) => {
  if (!plan) return 'Error: describe the planned change in plain words.';
  const { adrs } = await loadAdrs();
  return describeFindings(check(plan, adrs), 'this plan');
});

// Check one Jira issue against the decision log.
export const checkIssue = safe(async (payload) => {
  const key = String(payload.issueKey || payload.context?.jira?.issueKey || '').toUpperCase().trim();
  if (!key) return 'Error: tell me which Jira issue to check (for example ORB-12).';
  const [{ adrs }, issue] = await Promise.all([loadAdrs(), readIssue(key)]);
  return describeFindings(check(issue.text, adrs), `${key} "${issue.summary}"`);
});

// Record a new ADR (optionally superseding an old one and linking a Jira issue).
export const recordDecisionAction = safe(async (payload) => {
  if (!payload.title || !payload.decision) return 'Error: a decision needs at least a title and the decision itself.';
  const r = await recordDecision(payload, payload.context?.siteUrl);
  return `Recorded ${r.key} "${r.title}"${r.superseded ? `, superseding ${r.superseded}` : ''}: ${r.url}`;
});
