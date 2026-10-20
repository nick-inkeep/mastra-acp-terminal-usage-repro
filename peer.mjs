import { Readable, Writable } from 'node:stream';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const reportedUsage = {
  inputTokens: 17,
  outputTokens: 9,
  totalTokens: 26,
  cachedReadTokens: 3,
};
const usageMode = process.argv[2] ?? 'reported';
const usage = usageMode === 'absent' ? undefined : usageMode === 'zero'
  ? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  : reportedUsage;

const connection = new AgentSideConnection(client => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {}, authMethods: [] };
  },
  async newSession() {
    return { sessionId: 'usage-session' };
  },
  async prompt({ sessionId }) {
    await client.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'fixture answer' },
      },
    });
    return { stopReason: 'end_turn', ...(usage === undefined ? {} : { usage }) };
  },
  async cancel() {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));

await connection.closed;
process.stdin.destroy();
process.stdout.end();
