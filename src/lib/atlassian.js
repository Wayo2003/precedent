// Everything that talks to Confluence / Jira REST APIs. All calls run asUser(), so Precedent only
// sees decisions and issues the current user can already see.
//
// Where decisions live: child pages of a Confluence page titled "Decision Log" (any space), plus
// any page labelled "adr" anywhere on the site (found via CQL search).

import api, { route } from '@forge/api';
import { parseAdr, normalizeKey } from './decisions.js';
import { DEMO_ADRS, DEMO_ISSUES, DEMO_TEAM, adrBody } from './demo.js';

export const LOG_TITLE = 'Decision Log';
const user = () => api.asUser();
const H = { Accept: 'application/json', 'Content-Type': 'application/json' };

async function json(res, what) {
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    if (/wiki|confluence/i.test(what)) throw new Error(`${what}: Confluence returned ${res.status}. Precedent must be installed in Confluence on this site too (open the installation link again and choose Confluence). Details: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// At most `size` requests in flight: fast, but polite to rate limits.
async function pool(items, size, fn) {
  const out = [];
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- Confluence: reading decisions

async function firstSpace(spaceKey) {
  const res = spaceKey
    ? await user().requestConfluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`, { headers: H })
    : await user().requestConfluence(route`/wiki/api/v2/spaces?type=global&limit=25`, { headers: H });
  const spaces = (await json(res, 'Read Confluence spaces')).results || [];
  if (!spaces.length) throw new Error(spaceKey ? `Confluence space ${spaceKey} not found.` : 'No Confluence space found. Create a space first.');
  return spaces[0];
}

// The "Decision Log" page (title lookup is not search-indexed, so it works right after creation).
export async function findLog() {
  const res = await user().requestConfluence(route`/wiki/api/v2/pages?title=${LOG_TITLE}&status=current&limit=5`, { headers: H });
  const page = ((await json(res, 'Find Decision Log (wiki)')).results || [])[0];
  return page || null;
}

const pageUrl = (base, p) => (p?._links?.webui ? `${base || ''}${p._links.webui}` : '');

// Load all ADRs: children of the Decision Log + any page labelled "adr" (CQL, eventually consistent).
export async function loadAdrs() {
  const pages = new Map();
  const log = await findLog();
  let base = '';
  if (log) {
    const kids = await json(await user().requestConfluence(route`/wiki/api/v2/pages/${log.id}/children?limit=250`, { headers: H }), 'Read Decision Log children (wiki)');
    base = kids?._links?.base || '';
    const ids = (kids.results || []).map((k) => k.id);
    // Fetch bodies in parallel (each page once, storage format).
    await pool(ids, 6, async (id) => {
      const p = await json(await user().requestConfluence(route`/wiki/api/v2/pages/${id}?body-format=storage`, { headers: H }), 'Read ADR page (wiki)');
      base = base || p?._links?.base || '';
      pages.set(p.id, { id: p.id, title: p.title, body: p.body?.storage?.value || '', created: p.createdAt, url: pageUrl(base, p) });
    });
  }
  try {
    const res = await user().requestConfluence(route`/wiki/rest/api/search?cql=${'type=page AND label="adr"'}&limit=100&expand=content.body.storage`, { headers: H });
    const found = await json(res, 'Search ADRs (wiki)');
    base = base || found?._links?.base || '';
    for (const r of found.results || []) {
      const c = r.content;
      if (c && !pages.has(c.id)) pages.set(c.id, { id: c.id, title: c.title, body: c.body?.storage?.value || '', url: `${found._links?.base || base}${c._links?.webui || ''}` });
    }
  } catch (e) {
    console.warn('CQL search failed, using Decision Log only', e.message);
  }
  const adrs = [...pages.values()].map(parseAdr).filter(Boolean);
  // If two pages claim the same number, keep the newest id.
  const byKey = new Map();
  for (const a of adrs.sort((x, y) => Number(x.id) - Number(y.id))) byKey.set(a.key, a);
  return { log, adrs: [...byKey.values()].sort((a, b) => a.number - b.number) };
}

// ---------------------------------------------------------------- Confluence: writing decisions

async function addLabels(pageId, labels) {
  const body = [...new Set(['adr', ...labels])].map((name) => ({ prefix: 'global', name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-') }));
  const res = await user().requestConfluence(route`/wiki/rest/api/content/${pageId}/label`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!res.ok) console.warn(`Labels on ${pageId} failed: ${res.status}`); // labels are a nice-to-have
}

async function createPage(spaceId, parentId, title, value) {
  const res = await user().requestConfluence(route`/wiki/api/v2/pages`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ spaceId, ...(parentId ? { parentId } : {}), status: 'current', title, body: { representation: 'storage', value } }),
  });
  const p = await json(res, `Create page "${title}" (wiki)`);
  return { ...p, url: pageUrl(p?._links?.base, p) };
}

const LOG_BODY = (team) => `<p>Architecture decisions of <strong>${team}</strong>. Each child page is one Architecture Decision Record (ADR). <strong>Precedent</strong> checks Jira issues, Rovo conversations and coding agents (via MCP) against them, so nobody reopens a settled decision by accident.</p><ac:structured-macro ac:name="children"><ac:parameter ac:name="sort">title</ac:parameter></ac:structured-macro>`;

async function ensureLog(spaceKey, team = 'your team') {
  const existing = await findLog();
  if (existing) return existing;
  const space = await firstSpace(spaceKey);
  return createPage(space.id, null, LOG_TITLE, LOG_BODY(team));
}

// Record a new decision as the next ADR under the Decision Log. Optionally marks an older ADR
// as superseded and comments on a related Jira issue.
export async function recordDecision(input, siteUrl) {
  const { log, adrs } = await loadAdrs();
  const logPage = log || (await ensureLog(input.spaceKey));
  const number = Math.max(0, ...adrs.map((a) => a.number)) + 1;
  const key = `ADR-${String(number).padStart(3, '0')}`;
  const date = new Date().toISOString().slice(0, 10);
  const alternatives = String(input.alternatives || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  const tags = String(input.tags || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const page = await createPage(logPage.spaceId, logPage.id, `${key}: ${input.title}`, adrBody({
    status: 'Accepted', date, owner: input.owner || 'Recorded with Precedent', context: input.context || '', decision: input.decision || '',
    alternatives, consequences: input.consequences || '', tags, relatedIssue: input.issueKey ? `${siteUrl ? `${siteUrl}/browse/` : ''}${input.issueKey}` : '',
  }));
  await addLabels(page.id, tags);

  let superseded = null;
  if (input.supersedes) {
    const old = adrs.find((a) => a.key === normalizeKey(input.supersedes));
    if (old) { await markSuperseded(old.id, key); superseded = old.key; }
  }
  if (input.issueKey) await comment(input.issueKey, `Decision recorded: ${key} "${input.title}". ${page.url}`);
  return { key, title: input.title, url: page.url, superseded };
}

// Rewrite the Status section of an ADR page to "Superseded by ADR-xxx".
async function markSuperseded(pageId, byKey) {
  const p = await json(await user().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`, { headers: H }), 'Read ADR (wiki)');
  const value = (p.body?.storage?.value || '').replace(/(<h2[^>]*>\s*Status\s*<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i, `$1Superseded by ${byKey}$2`);
  await json(await user().requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ id: pageId, status: 'current', title: p.title, body: { representation: 'storage', value }, version: { number: p.version.number + 1, message: `Superseded by ${byKey} (Precedent)` } }),
  }), 'Update ADR (wiki)');
}

// ---------------------------------------------------------------- Jira

// Plain text from Atlassian Document Format.
const adfText = (n) => (!n ? '' : typeof n === 'string' ? n : n.text || (n.content || []).map(adfText).join(n.type === 'paragraph' ? '\n' : ' '));
export const adf = (text) => ({ type: 'doc', version: 1, content: String(text).split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) });

export async function readIssue(issueKey) {
  const i = await json(await user().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,project,status`, { headers: H }), `Read ${issueKey}`);
  return { key: i.key, summary: i.fields.summary, text: `${i.fields.summary}\n${adfText(i.fields.description)}`, projectKey: i.fields.project.key, status: i.fields.status?.name };
}

// Open issues of a project (newest first), for the "issues reopening decisions" view.
export async function openIssues(projectKey, max = 50) {
  const body = { jql: `project = "${projectKey}" AND statusCategory != Done ORDER BY created DESC`, maxResults: max, fields: ['summary', 'description', 'status'] };
  const r = await json(await user().requestJira(route`/rest/api/3/search/jql`, { method: 'POST', headers: H, body: JSON.stringify(body) }), 'Search issues');
  return (r.issues || []).map((i) => ({ key: i.key, summary: i.fields.summary, text: `${i.fields.summary}\n${adfText(i.fields.description)}`, status: i.fields.status?.name }));
}

export async function comment(issueKey, text) {
  await json(await user().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, { method: 'POST', headers: H, body: JSON.stringify({ body: adf(text) }) }), `Comment on ${issueKey}`);
}

async function createIssues(projectKey, items) {
  const p = await json(await user().requestJira(route`/rest/api/3/project/${projectKey}`, { headers: H }), 'Read project');
  const types = (p.issueTypes || []).filter((t) => !t.subtask);
  const type = types.find((t) => t.name === 'Task') || types.find((t) => t.name === 'Story') || types[0];
  const issueUpdates = items.map(([summary, description]) => ({ fields: { project: { id: p.id }, issuetype: { id: type.id }, summary, description: adf(description) } }));
  const out = await json(await user().requestJira(route`/rest/api/3/issue/bulk`, { method: 'POST', headers: H, body: JSON.stringify({ issueUpdates }) }), 'Create issues');
  return out.issues.map((x) => x.key);
}

// ---------------------------------------------------------------- demo (two short phases: Forge functions must finish in 25 s)

export async function seedDemo(projectKey, phase, spaceKey) {
  if (phase === 'confluence') {
    const log = await ensureLog(spaceKey, DEMO_TEAM);
    const { adrs } = await loadAdrs();
    const have = new Set(adrs.map((a) => a.number));
    const todo = DEMO_ADRS.filter(([n]) => !have.has(n));
    await pool(todo, 4, async ([n, title, status, date, owner, tags, context, decision, alternatives, consequences]) => {
      const page = await createPage(log.spaceId, log.id, `ADR-${String(n).padStart(3, '0')}: ${title}`, adrBody({ status, date, owner, context, decision, alternatives, consequences, tags }));
      await addLabels(page.id, tags);
    });
    return { created: todo.length, log: log.title };
  }
  // phase 'jira': create the demo issues that do not exist yet (matched by summary)
  const existing = new Set((await openIssues(projectKey, 100)).map((i) => i.summary));
  const todo = DEMO_ISSUES.filter(([s]) => !existing.has(s));
  const keys = todo.length ? await createIssues(projectKey, todo) : [];
  return { created: keys.length, message: `Demo ready: ${DEMO_ADRS.length} ADRs in Confluence "${LOG_TITLE}" and ${DEMO_ISSUES.length} issues in ${projectKey}.` };
}
