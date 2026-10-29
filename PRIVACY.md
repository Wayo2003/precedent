# Precedent privacy policy

_Last updated: 29 October 2026_

Precedent is an Atlassian Forge app that runs entirely on Atlassian's infrastructure ("Runs on Atlassian").

**What Precedent reads.** Confluence pages that are children of a page titled "Decision Log" or labelled `adr` (title, body, labels), and Jira issues of the project you open (summary, description, status). All requests are made as the signed-in user, so Precedent only sees what that user is already allowed to see.

**What Precedent writes.** Only when a user clicks a button or confirms an agent/MCP action: new ADR pages (and an updated status on a superseded ADR), labels on those pages, Jira comments with decision warnings, and the demo pages and issues when "Load demo" is used.

**What Precedent stores.** Nothing. Precedent has no database and no app storage; it does not copy, cache or export your data, and it sends no data to any service outside Atlassian. The app declares no egress (external network access) in its manifest.

**AI.** The Precedent agent runs inside Atlassian Rovo and is subject to Atlassian's AI and data policies. MCP clients you connect act under your own account, with the OAuth consent you give. Precedent itself does not call any external AI service.

**Contact.** Questions or requests: open an issue at https://github.com/Wayo2003/precedent/issues.
