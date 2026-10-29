// Precedent project page (Jira > Project > Precedent).
// Top: open issues that reopen or rely on superseded decisions. Below: the full decision log.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DynamicTable, EmptyState, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Tab, TabList, TabPanel, Tabs, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const KIND = {
  reopens: { text: 'Reopens decision', appearance: 'removed' },
  superseded: { text: 'Relies on superseded', appearance: 'moved' },
  related: { text: 'Related', appearance: 'default' },
};
const STATUS = { Accepted: 'success', Proposed: 'inprogress', Superseded: 'removed', Deprecated: 'removed' };

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    setError(null);
    try { setData(await invoke('getOverview')); } catch (e) { setError(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const run = async (name, fn) => {
    setBusy(name);
    setNotice(null);
    try { setNotice(await fn()); await load(); } catch (e) { setNotice({ appearance: 'error', title: 'Something went wrong', body: e.message || String(e) }); } finally { setBusy(null); }
  };

  // Two short backend calls: Confluence ADRs, then Jira issues (Forge functions must finish in 25 s).
  const seed = () => run('seed', async () => {
    await invoke('seedDemo', { phase: 'confluence' });
    const r = await invoke('seedDemo', { phase: 'jira' });
    return { appearance: 'success', title: 'Demo loaded', body: r.message };
  });
  const warn = (issueKey) => run(`warn-${issueKey}`, async () => {
    const r = await invoke('warnIssue', { issueKey });
    return { appearance: r.posted ? 'success' : 'information', title: r.posted ? `Warning posted on ${issueKey}` : 'Nothing to post', body: r.posted ? 'The team will see which decision this reopens, right in the issue.' : 'No conflicting decision found.' };
  });

  if (error) {
    return (
      <SectionMessage appearance="error" title="Precedent could not load">
        <Text>{error}</Text>
        <Button onClick={load}>Try again</Button>
      </SectionMessage>
    );
  }
  if (!data) return <Spinner label="Reading the decision log" />;

  const { projectKey, siteUrl, adrs, flagged } = data;
  const banner = notice && <SectionMessage appearance={notice.appearance} title={notice.title}><Text>{notice.body}</Text></SectionMessage>;
  const issueLink = (key) => <Link href={`${siteUrl}/browse/${key}`} openNewTab>{key}</Link>;
  const adrLink = (f) => (f.url ? <Link href={f.url} openNewTab>{f.key}</Link> : <Text>{f.key}</Text>);

  if (!adrs.length) {
    return (
      <Stack space="space.200">
        {banner}
        <EmptyState
          header="No decisions recorded yet"
          description={'Precedent reads Architecture Decision Records (ADRs): child pages of a Confluence page titled "Decision Log", or any page labelled "adr". It then warns when Jira issues, Rovo chats or coding agents reopen a settled decision. Load a realistic demo to see it.'}
          primaryAction={<Button appearance="primary" onClick={seed} isDisabled={!!busy}>{busy === 'seed' ? 'Loading demo…' : 'Load demo: Orbit Payments decision log'}</Button>}
        />
      </Stack>
    );
  }

  const reopen = flagged.filter((i) => i.findings.some((f) => f.kind === 'reopens')).length;

  const flaggedRows = flagged.map((i) => {
    const top = i.findings.filter((f) => f.kind !== 'related');
    return {
      key: i.key,
      cells: [
        { key: 'issue', content: <Stack><Text>{issueLink(i.key)}</Text><Text size="small">{i.summary}</Text></Stack> },
        { key: 'kind', content: <Lozenge appearance={KIND[top[0].kind].appearance} isBold>{KIND[top[0].kind].text}</Lozenge> },
        { key: 'adr', content: <Stack space="space.050">{top.map((f) => <Stack key={f.key}><Inline space="space.050" alignBlock="center">{adrLink(f)}<Text size="small">{f.title}</Text></Inline><Text size="small">{`${f.reasons[0]} · ${f.owner}, ${f.date}`}</Text></Stack>)}</Stack> },
        { key: 'act', content: <Button spacing="compact" onClick={() => warn(i.key)} isDisabled={!!busy}>{busy === `warn-${i.key}` ? 'Posting…' : 'Warn on issue'}</Button> },
      ],
    };
  });

  const adrRows = adrs.map((a) => ({
    key: a.key,
    cells: [
      { key: 'key', content: a.url ? <Link href={a.url} openNewTab>{a.key}</Link> : <Text>{a.key}</Text> },
      { key: 'title', content: <Stack><Strong>{a.title}</Strong><Text size="small">{a.decision}</Text></Stack> },
      { key: 'status', content: <Lozenge appearance={STATUS[a.status] || 'default'} isBold>{a.supersededBy ? `Superseded by ${a.supersededBy}` : a.status}</Lozenge> },
      { key: 'rejected', content: <Text size="small">{a.alternatives.map((x) => x.name).join(', ') || '-'}</Text> },
      { key: 'who', content: <Stack><Text size="small">{a.owner}</Text><Text size="small">{a.date}</Text></Stack> },
    ],
  }));

  return (
    <Stack space="space.300">
      {banner}
      <Inline spread="space-between" alignBlock="center" shouldWrap>
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Heading as="h2" size="large">{reopen ? `${reopen} open issue${reopen > 1 ? 's' : ''} reopen settled decisions` : 'No open issue reopens a decision'}</Heading>
            <Lozenge appearance={reopen ? 'removed' : 'success'} isBold>{reopen ? 'Check before building' : 'Aligned'}</Lozenge>
          </Inline>
          <Text>{`${projectKey} · ${adrs.length} decisions in the log · ${flagged.length} issues need a look`}</Text>
        </Stack>
        <Button onClick={load} isDisabled={!!busy}>Refresh</Button>
      </Inline>

      <Tabs id="precedent-tabs">
        <TabList>
          <Tab>{`Issues reopening decisions (${flagged.length})`}</Tab>
          <Tab>{`Decision log (${adrs.length})`}</Tab>
          <Tab>How it works</Tab>
        </TabList>
        <TabPanel>
          <Box paddingBlock="space.200">
            {flagged.length ? (
              <DynamicTable
                head={{ cells: [{ key: 'issue', content: 'Issue' }, { key: 'kind', content: 'Finding' }, { key: 'adr', content: 'Decision and why' }, { key: 'act', content: '' }] }}
                rows={flaggedRows}
                rowsPerPage={15}
              />
            ) : (
              <SectionMessage appearance="success" title="All open work is aligned with the decision log"><Text>Nothing in this project reopens an accepted decision.</Text></SectionMessage>
            )}
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlock="space.200">
            <DynamicTable
              head={{ cells: [{ key: 'key', content: 'ADR' }, { key: 'title', content: 'Decision' }, { key: 'status', content: 'Status' }, { key: 'rejected', content: 'Rejected alternatives' }, { key: 'who', content: 'Decided by' }] }}
              rows={adrRows}
              rowsPerPage={20}
            />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlock="space.200">
            <Stack space="space.150">
              <Text>Teams make a decision, write it down, and six months later someone reopens it because they never saw it. Precedent makes past decisions impossible to miss.</Text>
              <Text><Strong>Where decisions live:</Strong> child pages of a Confluence page titled "Decision Log" (or any page labelled "adr"), with sections Status, Date, Decided by, Context, Decision, Alternatives rejected, Consequences.</Text>
              <Text><Strong>What it checks:</Strong> an issue that proposes a rejected alternative reopens that decision; one that relies on a superseded decision is flagged too; same-topic work is shown as related.</Text>
              <Text><Strong>Rovo agent:</Strong> ask Precedent "What did we decide about dates?", "Does ORB-3 conflict with any decision?", "Record that we chose Postgres read replicas".</Text>
              <Text><Strong>MCP:</Strong> connect Claude Code, Cursor or any MCP client to Precedent so coding agents call check-plan before they write code.</Text>
              <Inline><Button onClick={seed} isDisabled={!!busy}>{busy === 'seed' ? 'Loading demo…' : 'Load or repair demo data'}</Button></Inline>
            </Stack>
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
