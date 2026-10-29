# Precedent: the decision memory of your software team

**Codegeist 2026 · Apps for Software Teams · Best app with Atlassian MCP**

Teams make an architecture decision, write it down in Confluence, and six months later someone opens a ticket that quietly reverses it: *"Store sessions in MongoDB"*, *"Use moment.js for the invoice dates"*, *"Add a GraphQL endpoint"*. Nobody saw the decision, the reasons get lost, and the same debate happens again. Now **AI coding agents** write the code too, and they have never read your decision log at all.

**Precedent** makes past decisions impossible to miss, for people *and* for coding agents:

- **Decision log from Confluence:** Architecture Decision Records (ADRs) as child pages of a *Decision Log* page (or any page labelled `adr`).
- **Jira project page:** every open issue that **reopens** a decision (proposes an alternative the team rejected) or **relies on a superseded** one, with who decided, when and why. One click posts the warning on the issue.
- **Issue panel:** the decisions behind the issue you are reading.
- **Precedent, a Rovo agent:** "What did we decide about dates?", "Does ORB-3 conflict with any decision?", "Record that we chose read replicas and it supersedes ADR-008".
- **MCP server (`rovo:mcp`):** the same tools for **Claude Code, Cursor or any MCP client**. Your coding agent calls `check-plan` *before* it picks a library, datastore, API style or tool.

## Tools (shared by the Rovo agent and the MCP server)

| Tool | Verb | What it does |
|---|---|---|
| `find-decisions` | GET | Search ADRs ("can we use Mongo?") → status, owner, date, decision, rejected alternatives, link |
| `decision-log` | GET | The whole log, one line per ADR |
| `check-plan` | GET | "I'm about to store sessions in MongoDB" → reopens ADR-001, rejected because… |
| `check-issue` | GET | Same check for a Jira issue |
| `record-decision` | CREATE | Writes the next numbered ADR page, can supersede an older ADR and comment on the Jira issue |

## ADR format

A Confluence page titled `ADR-007: <title>` with h2 sections: **Status** (Accepted / Proposed / Deprecated / *Superseded by ADR-009*), **Date**, **Decided by**, **Context**, **Decision**, **Alternatives rejected** (a list, `Name (alias, alias): why`), **Consequences**, **Tags**. `record-decision` and the demo write exactly this format.

## Try it in 2 minutes

1. Install Precedent with the installation link on **Jira and Confluence** of the same site.
2. Open any Jira project → **Precedent** (project navigation, maybe under "More") → **Load demo: Orbit Payments decision log**. It creates 10 ADRs in a Confluence *Decision Log* page and 6 Jira issues.
3. See 4 issues flagged: MongoDB (ADR-001), GraphQL (ADR-002), moment.js (ADR-003), and a nightly Jenkins job (rejected by ADR-009, relies on superseded ADR-008). Click **Warn on issue**, or open an issue to see the panel.
4. Rovo Chat → **Precedent** → "Does ORB-2 conflict with any decision?"
5. **MCP:** an admin enables the app's tools in *Atlassian Administration → Apps → Sites → your site → Connected apps → Precedent*. Then add the server to your client, for example Claude Code:
   ```bash
   claude mcp add --transport http precedent https://mcp.atlassian.com/forge/91f822bf-46cd-487a-8f9a-4b91e0fd96b7
   ```
   and ask: *"Before you change anything: can we store sessions in MongoDB?"*

## Built with

Forge (Runs on Atlassian, no egress, no storage) · UI Kit · `rovo:agent`, `rovo:mcp`, 5 `action`s, `jira:projectPage`, `jira:issueContext` · Confluence REST v2 (pages, children, versions) and v1 (CQL search, labels) · Jira REST v3 (search/jql, bulk create, comments). Every call runs `asUser()`.

## Develop

```bash
npm install
npm test
forge deploy -e development
forge install --site <site>.atlassian.net --product jira
forge install --site <site>.atlassian.net --product confluence
```

## Privacy

See [PRIVACY.md](PRIVACY.md). Precedent stores nothing and sends nothing outside Atlassian.

## License

MIT
