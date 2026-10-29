// Precedent core: parses Architecture Decision Records (ADRs) from Confluence pages and
// checks any text (a Jira issue, a pull request plan, a coding agent's intent) against them.
// Pure functions only, so the UI, the Rovo agent and the MCP tools all share one engine and
// it can be unit tested without Forge.
//
// An ADR is a Confluence page titled "ADR-007: <title>" with h2 sections:
//   Status (Proposed | Accepted | Deprecated | Superseded by ADR-xxx), Date, Decided by,
//   Context, Decision, Alternatives rejected (a list: "Name (alias, alias): why"), Consequences.

const SECTION_ALIASES = {
  status: ['status'],
  date: ['date', 'decided on'],
  owner: ['decided by', 'owner', 'deciders'],
  context: ['context', 'problem'],
  decision: ['decision'],
  alternatives: ['alternatives rejected', 'alternatives considered', 'rejected alternatives', 'options considered'],
  consequences: ['consequences'],
  tags: ['tags', 'topics'],
};

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|li|h\d|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

// Split storage-format HTML into { sectionName: htmlFragment } using its <h2> headings.
function sections(html) {
  const out = {};
  const parts = String(html).split(/<h2[^>]*>/i).slice(1);
  for (const part of parts) {
    const [head, ...rest] = part.split(/<\/h2>/i);
    const name = decode(head).toLowerCase();
    const key = Object.keys(SECTION_ALIASES).find((k) => SECTION_ALIASES[k].includes(name));
    if (key) out[key] = rest.join('</h2>');
  }
  return out;
}

// "MongoDB (Mongo, document store): no transactions across aggregates" -> { name, aliases, why }
function parseAlternative(line) {
  const m = line.match(/^\s*([^:(–-]+?)\s*(?:\(([^)]*)\))?\s*(?:[:–-]\s*(.*))?$/);
  if (!m) return null;
  const name = m[1].trim();
  if (!name) return null;
  const aliases = (m[2] || '').split(',').map((a) => a.trim()).filter(Boolean);
  return { name, aliases, why: (m[3] || '').trim() };
}

// Parse one Confluence page { id, title, body (storage), labels, url } into an ADR, or null.
export function parseAdr(page) {
  const t = String(page.title || '').match(/^\s*(ADR[-\s]?(\d+))\s*[:–-]\s*(.+)$/i);
  if (!t) return null;
  const s = sections(page.body || '');
  const statusText = decode(s.status || 'Accepted');
  const sup = statusText.match(/superseded\s+by\s+(ADR[-\s]?\d+)/i);
  const altHtml = s.alternatives || '';
  const altLines = (altHtml.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []).map(decode);
  return {
    id: page.id,
    number: Number(t[2]),
    key: `ADR-${String(Number(t[2])).padStart(3, '0')}`,
    title: t[3].trim(),
    status: sup ? 'Superseded' : (statusText.split(/\s/)[0] || 'Accepted').replace(/[^a-z]/gi, '').replace(/^./, (c) => c.toUpperCase()),
    supersededBy: sup ? normalizeKey(sup[1]) : null,
    date: decode(s.date || '').slice(0, 10) || page.created?.slice(0, 10) || '',
    owner: decode(s.owner || '') || page.author || '',
    context: decode(s.context || ''),
    decision: decode(s.decision || ''),
    alternatives: altLines.map(parseAlternative).filter(Boolean),
    consequences: decode(s.consequences || ''),
    // Tags come from a "Tags" section (comma separated) or, failing that, the page labels.
    tags: (s.tags ? decode(s.tags).split(/[,\n]/) : page.labels || []).map((x) => x.trim().toLowerCase()).filter((l) => l && l !== 'adr'),
    url: page.url || '',
  };
}

export const normalizeKey = (k) => {
  const m = String(k).match(/(\d+)/);
  return m ? `ADR-${String(Number(m[1])).padStart(3, '0')}` : String(k).toUpperCase();
};

// ---------------------------------------------------------------- matching

const STOP = new Set('a an and are as at be by for from has have in into is it its of on or our should that the their this to use used using we will with without add new make need needs via per all any can do not more less than also so if when then there these those which who why how what your you i me my let us get set up'.split(' '));

// Lowercase word tokens with light stemming (plural "s"), keeping dotted names like moment.js.
export function tokens(text) {
  return String(text).toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*[a-z0-9+#]|[a-z0-9]/g)?.filter((w) => !STOP.has(w) && w.length > 1).map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)) || [];
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word, case-insensitive mention of a name; "moment.js" also matches "momentjs" / "moment js".
function mentions(text, name) {
  const variants = new Set([name, name.replace(/\./g, ''), name.replace(/\./g, ' ')]);
  return [...variants].some((v) => v.length > 1 && new RegExp(`(^|[^a-z0-9])${escape(v.toLowerCase())}([^a-z0-9]|$)`).test(text));
}

// Words that describe what an ADR is about (title, decision, tags), for "related" matches.
function topicWords(adr) {
  return new Set([...tokens(adr.title), ...tokens(adr.decision).slice(0, 40), ...tokens(adr.consequences).slice(0, 20), ...adr.tags.flatMap(tokens)]);
}

// Check free text against all ADRs. Returns findings, strongest first:
//   reopens    -> the text proposes an alternative this decision explicitly rejected
//   superseded -> the text relies on a decision that has since been superseded
//   related    -> same topic; read the decision before changing it
export function check(text, adrs) {
  const lower = ` ${String(text).toLowerCase()} `;
  const words = new Set(tokens(text));
  const byKey = new Map(adrs.map((a) => [a.key, a]));
  const findings = [];
  for (const adr of adrs) {
    const reasons = [];
    let kind = null;
    let score = 0;
    if (adr.status !== 'Superseded' && adr.status !== 'Deprecated') {
      for (const alt of adr.alternatives) {
        const hit = [alt.name, ...alt.aliases].find((n) => mentions(lower, n));
        if (hit) {
          kind = 'reopens';
          score += 10;
          reasons.push(`mentions "${hit}", which ${adr.key} rejected${alt.why ? `: ${alt.why}` : ''}`);
        }
      }
    }
    const shared = [...topicWords(adr)].filter((w) => words.has(w));
    if (adr.status === 'Superseded' && shared.length >= 2) {
      const next = byKey.get(adr.supersededBy);
      kind = kind || 'superseded';
      score += 6;
      reasons.push(`relies on ${adr.key} "${adr.title}", superseded by ${adr.supersededBy}${next ? ` "${next.title}"` : ''}`);
    }
    if (shared.length >= 2 || adr.tags.some((t) => words.has(t))) {
      score += shared.length;
      if (!kind) { kind = 'related'; reasons.push(`same topic (${shared.slice(0, 4).join(', ') || adr.tags.join(', ')})`); }
    }
    if (kind) findings.push({ kind, score, key: adr.key, title: adr.title, status: adr.status, date: adr.date, owner: adr.owner, decision: adr.decision, reasons, url: adr.url, supersededBy: adr.supersededBy });
  }
  const order = { reopens: 0, superseded: 1, related: 2 };
  return findings.sort((a, b) => order[a.kind] - order[b.kind] || b.score - a.score).slice(0, 5);
}

// Rank ADRs for a free-text question ("what did we decide about dates?").
export function search(query, adrs, limit = 5) {
  const q = new Set(tokens(query));
  const lower = ` ${String(query).toLowerCase()} `;
  return adrs
    .map((a) => {
      const words = [...tokens(`${a.title} ${a.decision} ${a.context} ${a.tags.join(' ')}`), ...a.alternatives.flatMap((x) => tokens([x.name, ...x.aliases].join(' ')))];
      const score = words.filter((w) => q.has(w)).length * 2 + (a.alternatives.some((x) => [x.name, ...x.aliases].some((n) => mentions(lower, n))) ? 5 : 0) + (a.status === 'Accepted' ? 1 : 0);
      return { a, score };
    })
    .filter((x) => x.score > 1)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

// ---------------------------------------------------------------- text for agents

export function describeAdr(a) {
  const alts = a.alternatives.map((x) => `${x.name}${x.why ? ` (${x.why})` : ''}`).join('; ');
  return `${a.key} "${a.title}" [${a.status}${a.supersededBy ? ` by ${a.supersededBy}` : ''}] decided ${a.date || 'n/a'} by ${a.owner || 'n/a'}. Decision: ${a.decision}${alts ? ` Rejected: ${alts}.` : ''}${a.url ? ` Link: ${a.url}` : ''}`;
}

export function describeFindings(findings, subject) {
  if (!findings.length) return `No recorded decision conflicts with ${subject}. It is safe to proceed as far as the decision log knows.`;
  const head = findings.some((f) => f.kind === 'reopens')
    ? `WARNING: ${subject} reopens a past decision.`
    : findings.some((f) => f.kind === 'superseded') ? `CAUTION: ${subject} relies on a superseded decision.` : `${subject} touches decisions the team already made.`;
  return [head, ...findings.map((f) => `- ${f.kind.toUpperCase()} ${f.key} "${f.title}" (${f.status}, ${f.date}, ${f.owner}): ${f.reasons.join('; ')}. Decision: ${f.decision}${f.url ? ` Link: ${f.url}` : ''}`)].join('\n');
}
