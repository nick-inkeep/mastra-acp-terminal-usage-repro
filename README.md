# ACP terminal usage projection

This reproduces the outbound ACP adapter's current handling of optional terminal token usage. It uses a local ACP peer built with the real protocol SDK. It makes no model call and needs no API key.

Versions: `@mastra/core@1.78.0`, `@mastra/acp@0.4.2`, `@agentclientprotocol/sdk@0.21.0`. The lockfile pins the full installation. Tested with Node 24.19.0, npm 11.17.0, macOS 27.0 on arm64.

## Install and run

```sh
npm ci --ignore-scripts --registry=https://registry.npmjs.org
MASTRA_TELEMETRY_DISABLED=1 npm run control
MASTRA_TELEMETRY_DISABLED=1 npm run repro
```

To recreate the initial installation:

```sh
npm install --ignore-scripts --save-exact --registry=https://registry.npmjs.org @mastra/core@1.78.0 @mastra/acp@0.4.2 @agentclientprotocol/sdk@0.21.0
```

`npm run repro` is the triggering command. No build step is needed. Both commands exit zero after printing their observations; the reproduction is an observation program, not a passing assertion of usage preservation.

## Input and actual output

On the first and only prompt, `peer.mjs` sends text `fixture answer`, then returns:

```json
{
  "stopReason": "end_turn",
  "usage": { "inputTokens": 17, "outputTokens": 9, "totalTokens": 26, "cachedReadTokens": 3 }
}
```

The direct SDK control returns that terminal response intact and asserts the text and usage. The Mastra run returns the same text, but `onFinish.usage`, `onFinish.totalUsage`, and the `payload.output.usage` in both `step-finish` and `finish` chunks are:

```json
{ "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 }
```

A wrapper installed through `createClient` receives only the `agent_message_chunk` notification from this peer. The peer does not send usage in a notification.

## Expected behavior under the proposed usage capability

If the adapter supports the peer's terminal usage, those output surfaces would preserve the supplied primary counts `17/9/26`. The SDK marks `PromptResponse.usage` experimental, and Mastra's ACP documentation does not promise usage forwarding. This program establishes the missing projection; it does not establish a violated stable protocol or documented Mastra guarantee. It is relevant to the normalized-usage capability requested in [mastra-ai/mastra#22092](https://github.com/mastra-ai/mastra/issues/22092).

The case uses one prompt so the SDK comments' ambiguity between per-turn and session totals does not affect the comparison. It does not test the accuracy of any real model's token counts, billing, or multi-turn accumulation.

## Adjacent cases

```sh
MASTRA_TELEMETRY_DISABLED=1 node index.mjs mastra zero
MASTRA_TELEMETRY_DISABLED=1 node index.mjs mastra absent
```

`zero` sends measured zero counts and returns zero on the same surfaces. `absent` omits the terminal usage field and also returns zero. Both retain the text. The first is the adjacent control; the second is an additional observation, not a separate report.

`peer.mjs` is a child process with no descendants. It closes when its stdin closes; the direct control closes stdin and joins the child's close event, and Mastra uses `persistSession: false` to release its process after the prompt. The program creates no files.
