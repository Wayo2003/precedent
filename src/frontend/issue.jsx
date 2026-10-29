// Precedent issue panel: shows, right inside the Jira issue, which past decisions this work
// reopens, relies on (superseded), or relates to, with who decided and why.

import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const KIND = {
  reopens: ['Reopens', 'removed'],
  superseded: ['Superseded', 'moved'],
  related: ['Related', 'default'],
};

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [posted, setPosted] = useState(null);
  useEffect(() => { invoke('getIssueFindings').then(setData).catch((e) => setError(e.message || String(e))); }, []);

  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Checking the decision log" />;
  if (!data.count) return <Text>No decision log yet. Open the Precedent project page to load or connect one.</Text>;
  if (!data.findings.length) return <Inline space="space.100" alignBlock="center"><Lozenge appearance="success" isBold>Aligned</Lozenge><Text>{`No conflict with ${data.count} recorded decisions.`}</Text></Inline>;

  const blocking = data.findings.filter((f) => f.kind !== 'related');
  const warn = async () => setPosted(await invoke('warnIssue'));

  return (
    <Stack space="space.200">
      {blocking.length ? <Text><Strong>Check before building:</Strong> this issue goes against a decision the team already made.</Text> : null}
      {data.findings.map((f) => (
        <Stack key={f.key} space="space.050">
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance={KIND[f.kind][1]} isBold>{KIND[f.kind][0]}</Lozenge>
            {f.url ? <Link href={f.url} openNewTab>{f.key}</Link> : <Text>{f.key}</Text>}
          </Inline>
          <Strong>{f.title}</Strong>
          <Text size="small">{f.reasons.join('; ')}</Text>
          <Text size="small">{`Decided ${f.date} by ${f.owner}`}</Text>
        </Stack>
      ))}
      {blocking.length && !posted ? <Inline><Button spacing="compact" onClick={warn}>Post warning as comment</Button></Inline> : null}
      {posted?.posted ? <Text size="small">Warning posted as a comment.</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
