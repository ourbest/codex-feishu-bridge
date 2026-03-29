import { createInterface } from 'node:readline';

import { parseChannelMessage, serializeChannelMessage, type ChannelMessage } from './protocol.ts';

function writeMessage(message: ChannelMessage): void {
  process.stdout.write(`${serializeChannelMessage(message)}\n`);
}

async function run(): Promise<void> {
  writeMessage({
    type: 'status',
    state: 'ready',
  });

  const bootEvent = process.env.FEISHU_PLUGIN_BOOT_EVENT_JSON;
  if (bootEvent !== undefined && bootEvent.trim() !== '') {
    writeMessage(parseChannelMessage(bootEvent) as ChannelMessage);
  }

  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on('line', (line) => {
    const message = parseChannelMessage(line);

    if (message.type === 'stop') {
      writeMessage({
        type: 'status',
        state: 'stopped',
      });
      process.exit(0);
      return;
    }

    if (message.type === 'send') {
      process.stderr.write(`[feishu-plugin] send -> ${message.chatId}\n`);
    }
  });

  process.on('SIGINT', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    process.exit(0);
  });
}

void run().catch((error) => {
  process.stderr.write(`[feishu-plugin] fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
