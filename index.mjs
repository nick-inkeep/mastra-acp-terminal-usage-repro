import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { AcpAgent } from '@mastra/acp';

const mode = process.argv[2] ?? 'mastra';
const usageMode = process.argv[3] ?? 'reported';
const suppliedUsage = usageMode === 'absent' ? undefined : usageMode === 'zero'
  ? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  : { inputTokens: 17, outputTokens: 9, totalTokens: 26, cachedReadTokens: 3 };
const peerPath = fileURLToPath(new URL('./peer.mjs', import.meta.url));
const cwd = dirname(peerPath);
const notifications = [];
const childEnv = { PATH: dirname(process.execPath), NODE_OPTIONS: '', NODE_PATH: '' };

if (mode === 'sdk') {
  const child = spawn(process.execPath, [peerPath, usageMode], {
    cwd,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  let stderr = '';
  child.stderr.on('data', value => { stderr += value; });
  const connection = new ClientSideConnection(() => ({
    async sessionUpdate(notification) { notifications.push(notification); },
    async requestPermission() { return { outcome: { outcome: 'cancelled' } }; },
  }), ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  let response;
  try {
    await connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
    const { sessionId } = await connection.newSession({ cwd, mcpServers: [] });
    response = await connection.prompt({ sessionId, prompt: [{ type: 'text', text: 'Return fixture data' }] });
  } finally {
    child.stdin.end();
    const [code, signal] = await closed;
    assert.equal(code, 0, stderr);
    assert.equal(signal, null);
  }
  const text = notifications.map(value => value.update.content?.text ?? '').join('');
  assert.equal(text, 'fixture answer');
  assert.deepEqual(response.usage, suppliedUsage);
  console.log(JSON.stringify({ node: process.version, mode, usageMode, text, terminalResponse: response, control: 'passed' }, null, 2));
} else if (mode === 'mastra') {
  let finish;
  const agent = new AcpAgent({
    id: 'usage-peer',
    description: 'Local ACP usage fixture',
    command: process.execPath,
    args: [peerPath, usageMode],
    cwd,
    env: childEnv,
    persistSession: false,
    createClient(defaultClient) {
      const sessionUpdate = defaultClient.sessionUpdate.bind(defaultClient);
      return Object.assign(defaultClient, {
        sessionUpdate: async function (notification) {
          notifications.push(notification);
          await sessionUpdate(notification);
        },
      });
    },
  });
  const chunks = [];
  let text;
  try {
    const result = await agent.stream('Return fixture data', { onFinish(value) { finish = value; } });
    for await (const chunk of result.fullStream) chunks.push(chunk);
    text = await result.text;
  } finally {
    agent.connection.disconnect();
  }
  assert.equal(text, 'fixture answer');
  assert.equal(notifications.length, 1);
  const finishChunks = chunks.filter(value => value.type === 'step-finish' || value.type === 'finish')
    .map(value => ({ type: value.type, usage: value.payload.output.usage }));
  assert.equal(finishChunks.length, 2);
  console.log(JSON.stringify({
    node: process.version,
    mode,
    usageMode,
    text,
    suppliedUsage: suppliedUsage ?? null,
    onFinish: { usage: finish.usage, totalUsage: finish.totalUsage },
    finishChunks,
    createClientUpdates: notifications.map(value => value.update.sessionUpdate),
  }, null, 2));
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
