// Demo content: the decision log of "Orbit", a fictional payments SaaS team, plus Jira issues
// that (deliberately) reopen, rely on superseded, or relate to those decisions.

export const DEMO_TEAM = 'Orbit Payments';

// [number, title, status, date, owner, tags, context, decision, alternatives[], consequences]
export const DEMO_ADRS = [
  [1, 'PostgreSQL is our only primary datastore', 'Accepted', '2026-02-11', 'Ana Ruiz (Staff Engineer)', ['datastore', 'database'],
    'Payments need multi-row ACID transactions and strong consistency. Running several databases doubled on-call load in 2025.',
    'All services persist state in PostgreSQL 16 (one cluster per region). Caching goes through Redis only for derived, rebuildable data.',
    ['MongoDB (Mongo, document database): no multi-document transactions across our ledger aggregates', 'DynamoDB: vendor lock-in and no ad-hoc SQL for finance'],
    'One backup, one migration tool (Flyway), one set of runbooks.'],
  [2, 'REST + OpenAPI for all public APIs', 'Accepted', '2026-02-24', 'Ben Okafor (API Lead)', ['api'],
    'Partners integrate with generated SDKs and need stable, cacheable endpoints.',
    'Public and partner APIs are REST, described in OpenAPI 3.1 and versioned in the URL (/v1, /v2).',
    ['GraphQL (graph api): breaks HTTP caching and per-endpoint rate limiting; revisit for v3', 'gRPC: not consumable from partner browsers'],
    'SDKs are generated from the OpenAPI spec in CI.'],
  [3, 'date-fns for all date handling in TypeScript', 'Accepted', '2026-03-03', 'Chen Wei (Frontend Lead)', ['dates', 'frontend'],
    'Invoices are rendered in 14 locales and time zones; bundle size matters on mobile.',
    'Use date-fns (with date-fns-tz) everywhere in web and Node code.',
    ['moment.js (moment, momentjs): in maintenance mode, mutable and 4x larger bundle', 'Luxon: fine, but we standardise on one library'],
    'Lint rule bans importing moment.'],
  [4, 'Kafka for asynchronous domain events', 'Accepted', '2026-03-17', 'Dana Kovacs (Platform)', ['messaging', 'events'],
    'Ledger, risk and notifications consume the same payment events and must be able to replay them.',
    'Domain events are published to Kafka topics with Avro schemas in the schema registry.',
    ['RabbitMQ: no replay of historical events', 'Webhooks between services: tight coupling and retries we would own'],
    'Every new event needs a schema PR.'],
  [5, 'Short-lived JWT access tokens with OIDC', 'Accepted', '2026-04-02', 'Ana Ruiz (Staff Engineer)', ['auth', 'security'],
    'PCI DSS scope and multiple frontends (web, mobile, partner portal).',
    'Users authenticate via OIDC; services accept 15-minute JWT access tokens and rotate refresh tokens.',
    ['Server-side session cookies (session cookie, sticky sessions): need shared session storage and sticky load balancing', 'Long-lived API keys for users: cannot be revoked fast enough'],
    'Token revocation list lives in Redis.'],
  [6, 'Monorepo with pnpm workspaces', 'Accepted', '2026-04-20', 'Chen Wei (Frontend Lead)', ['repo', 'tooling'],
    'Shared types between API and web drifted across 9 repositories.',
    'All TypeScript code lives in one Bitbucket monorepo using pnpm workspaces and Turborepo caching.',
    ['Polyrepo (one repo per service): type drift and duplicated CI config', 'npm workspaces: slower installs'],
    'CODEOWNERS file defines review ownership per package.'],
  [7, 'TanStack Query for server state in the web app', 'Accepted', '2026-05-06', 'Chen Wei (Frontend Lead)', ['frontend', 'state'],
    'Most frontend bugs in Q1 were stale or duplicated server data.',
    'Server state is managed with TanStack Query; local UI state stays in React components.',
    ['Redux (redux toolkit, global store): boilerplate and manual cache invalidation for server data'],
    'No new global store without an ADR.'],
  [8, 'Jenkins for CI', 'Superseded by ADR-009', '2025-06-10', 'Dana Kovacs (Platform)', ['ci', 'build'],
    'We needed self-hosted CI for the first services.',
    'Build and test every service on a self-hosted Jenkins cluster with nightly builds.',
    [],
    'Superseded in 2026 because of maintenance cost.'],
  [9, 'Bitbucket Pipelines for CI/CD', 'Accepted', '2026-06-01', 'Dana Kovacs (Platform)', ['ci', 'build', 'deploy'],
    'Jenkins maintenance cost two engineer-days per week and plugins blocked upgrades.',
    'All builds, tests and deployments run in Bitbucket Pipelines next to the monorepo; Jenkins is being decommissioned.',
    ['Jenkins (self-hosted ci, nightly jenkins job): maintenance cost and plugin drift'],
    'Pipeline templates live in /ci.'],
  [10, 'Feature flags through our flags service', 'Accepted', '2026-07-08', 'Ben Okafor (API Lead)', ['release', 'flags'],
    'Risky payment changes must be released gradually per merchant.',
    'Every user-facing change ships behind a flag in the internal flags service, with per-merchant targeting.',
    ['Environment variables as flags (env var toggle): need a redeploy to change', 'Long-lived release branches: merge pain'],
    'Flags older than 90 days are reported weekly.'],
];

// Jira issues for the demo: [summary, description]
export const DEMO_ISSUES = [
  ['Store user sessions in MongoDB for faster reads', 'Sessions table is getting big. Proposal: move session storage to a MongoDB collection with TTL indexes.'],
  ['Add a GraphQL endpoint for the mobile app', 'Mobile wants to fetch merchant, payouts and disputes in one round trip. Let us expose a GraphQL API.'],
  ['Use moment.js to format invoice due dates', 'Quick fix for the invoice PDF: format due dates with moment and moment-timezone.'],
  ['Set up a nightly Jenkins job for the reconciliation service', 'Reconciliation needs a nightly build and integration test run on Jenkins.'],
  ['Add index on payments.created_at in PostgreSQL', 'Dashboard query on payments by created_at is slow; add a btree index via a Flyway migration.'],
  ['Show payout schedule in merchant dashboard', 'New widget listing the next five payouts with amounts and dates.'],
];

// Confluence storage format for one ADR.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function adrBody({ status, date, owner, context, decision, alternatives = [], consequences, tags = [], relatedIssue }) {
  return [
    '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Architecture Decision Record managed with <strong>Precedent</strong>. Jira issues and coding agents are checked against it automatically.</p></ac:rich-text-body></ac:structured-macro>',
    `<h2>Status</h2><p>${esc(status)}</p>`,
    `<h2>Date</h2><p>${esc(date)}</p>`,
    `<h2>Decided by</h2><p>${esc(owner)}</p>`,
    `<h2>Context</h2><p>${esc(context)}</p>`,
    `<h2>Decision</h2><p>${esc(decision)}</p>`,
    `<h2>Alternatives rejected</h2>${alternatives.length ? `<ul>${alternatives.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p>None recorded.</p>'}`,
    `<h2>Consequences</h2><p>${esc(consequences || '')}</p>`,
    `<h2>Tags</h2><p>${esc(tags.join(', '))}</p>`,
    relatedIssue ? `<h2>Related work</h2><p>${esc(relatedIssue)}</p>` : '',
  ].join('');
}
