import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildBridgeStatusCard,
  buildAgentStatusCard,
  buildProjectReplyCard,
  buildHelpCard,
  buildMarkdownContentCard,
  buildCommandResultCard,
  buildUnavailableProjectCard,
  buildUnboundCard,
  buildUnknownCommandCard,
  buildRateLimitCard,
  buildThreadListCard,
  buildFileReceivedCard,
} from '../../../src/adapters/lark/cards.ts';

test('buildProjectReplyCard builds card with correct structure', () => {
  const card = JSON.parse(
    buildProjectReplyCard({
      projectTitle: 'test-project',
      bodyMarkdown: 'This is a test reply',
      footerItems: [{ label: 'ID', value: '123' }],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'test-project | 🤖 Claude Code');
  assert.strictEqual(card.body?.elements?.[0]?.content, 'This is a test reply');
  const footerText = JSON.stringify(card.body?.elements?.[2]?.content);
  assert.ok(footerText.includes('ID: 123'));
});

test('buildBridgeStatusCard builds card with correct structure', () => {
  const card = JSON.parse(
    buildBridgeStatusCard({
      projectTitle: 'bridge-project',
      statusLabel: 'working',
      bodyMarkdown: 'Processing something...',
      footerItems: [{ label: 'Status', value: 'OK' }],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'bridge-project | 🤖 Claude Code');
  assert.strictEqual(card.header?.subtitle?.content, 'working');
  assert.strictEqual(card.body?.elements?.[0]?.content, 'Processing something...');
});

test('buildHelpCard builds card with command lists', () => {
  const card = JSON.parse(
    buildHelpCard({
      bridgeCommands: [{ command: '//bind', description: 'Bind project' }],
      codexCommands: [{ command: '//status', description: 'Show status' }],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'lark-agent-bridge help');
  const bodyText = JSON.stringify(card.body?.elements);
  assert.ok(bodyText.includes('//bind'));
  assert.ok(bodyText.includes('//status'));
});

test('buildMarkdownContentCard builds card with markdown', () => {
  const card = JSON.parse(
    buildMarkdownContentCard({
      title: 'Info',
      bodyMarkdown: '# Header\nContent',
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'Info');
  assert.strictEqual(card.body?.elements?.[0]?.content, '# Header\nContent');
});

test('buildCommandResultCard builds card with lines', () => {
  const card = JSON.parse(
    buildCommandResultCard({
      title: 'Result',
      lines: ['line 1', 'line 2'],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'Result');
  const bodyText = card.body?.elements?.[0]?.content;
  assert.ok(bodyText.includes('line 1'));
  assert.ok(bodyText.includes('line 2'));
});

test('buildUnavailableProjectCard builds card with reconnection info', () => {
  const card = JSON.parse(
    buildUnavailableProjectCard({
      projectId: 'cms-fe',
      lines: ['Error line 1', 'Error line 2'],
      footerItems: [{ label: 'Status', value: 'Error' }],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, 'cms-fe | 🤖 Claude Code');
  assert.strictEqual(card.header?.subtitle?.content, '不可用');
  assert.ok(JSON.stringify(card.body?.elements).includes('Error line 1'));
});

test('buildAgentStatusCard builds card with all fields', () => {
  const card = JSON.parse(
    buildAgentStatusCard({
      projectId: 'project-a',
      statusLabel: 'working',
      bodyMarkdown: '正在处理请求...',
      rateBar: '[████████░░]',
      ratePercent: 80,
      cwd: '/path/to/project',
      model: 'opus-4-6',
      sessionId: 'sess_abc123',
      gitStatus: 'modified',
      gitBranch: 'main',
      gitDiffStat: '+5 -3',
      backgroundTasks: [{ id: '1', name: 'analysis', status: 'running' }],
      template: 'blue',
    }).content,
  ) as {
    header?: { title?: { content?: string }; subtitle?: { content?: string }; template?: string };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };

  assert.strictEqual(card.header?.title?.content, 'project-a | 🤖 Claude Code');
  assert.strictEqual(card.header?.subtitle?.content, 'working | [████████░░] 80% left');
  assert.strictEqual(card.header?.template, 'blue');
  // Body contains the processing content
  const bodyText = JSON.stringify(card.body?.elements ?? []);
  assert.ok(bodyText.includes('正在处理请求...'));
  // Agent status info is in footer
  assert.ok(bodyText.includes('/path/to/project'));
  assert.ok(bodyText.includes('opus-4-6'));
  assert.ok(bodyText.includes('sess_abc123'));
  assert.ok(bodyText.includes('git: ✗ | branch: main | +5 -3'));
  assert.ok(bodyText.includes('analysis [running]'));
});

test('buildAgentStatusCard respects providerName', () => {
  const card = JSON.parse(
    buildAgentStatusCard({
      projectId: 'project-q',
      providerName: 'Qwen',
      statusLabel: 'working',
      bodyMarkdown: 'Thinking...',
      rateBar: '[████████░░]',
      ratePercent: 80,
      cwd: '/path/to/project',
      model: 'qwen-max',
      sessionId: 'sess_qwen',
      gitStatus: 'clean',
      gitBranch: 'main',
      gitDiffStat: '',
    }).content,
  ) as { header?: { title?: { content?: string } } };

  assert.strictEqual(card.header?.title?.content, 'project-q | 🤖 Qwen');
});

test('buildAgentStatusCard shows a zero rate when the rate bar is known', () => {
  const card = JSON.parse(
    buildAgentStatusCard({
      projectId: 'project-zero',
      statusLabel: 'working',
      bodyMarkdown: 'Thinking...',
      rateBar: '[--------------------]',
      ratePercent: 0,
      cwd: '/path/to/project',
      model: 'qwen-max',
      sessionId: 'sess_zero',
      gitStatus: 'clean',
      gitBranch: 'main',
      gitDiffStat: '',
    }).content,
  ) as { header?: { subtitle?: { content?: string } } };

  assert.strictEqual(card.header?.subtitle?.content, 'working | [--------------------] 0% left');
});

test('buildAgentStatusCard omits background tasks line when empty', () => {
  const card = JSON.parse(
    buildAgentStatusCard({
      projectId: 'project-a',
      statusLabel: 'done',
      bodyMarkdown: '已完成',
      rateBar: '[██████████]',
      ratePercent: 100,
      cwd: '/path/to/project',
      model: 'opus-4-6',
      sessionId: 'sess_abc123',
      gitStatus: 'clean',
      gitBranch: 'main',
      gitDiffStat: '',
    }).content,
  ) as {
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };

  const bodyText = JSON.stringify(card.body?.elements ?? []);
  assert.ok(!bodyText.includes('[running]'));
  assert.ok(!bodyText.includes('[pending]'));
});

test('buildAgentStatusCard handles unknown git status', () => {
  const card = JSON.parse(
    buildAgentStatusCard({
      projectId: 'project-a',
      statusLabel: 'working',
      bodyMarkdown: '...',
      rateBar: '...',
      ratePercent: 0,
      cwd: '...',
      model: '...',
      sessionId: '...',
      gitStatus: 'unknown',
      gitBranch: '',
      gitDiffStat: '',
    }).content,
  ) as {
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };

  const bodyText = JSON.stringify(card.body?.elements ?? []);
  assert.ok(!bodyText.includes('git:'));
});

test('buildRateLimitCard uses provider-aware copy', () => {
  const card = JSON.parse(
    buildRateLimitCard({
      projectId: 'project-a',
      providerName: 'Qwen',
      retryAfterSeconds: 30,
    }).content,
  ) as {
    header?: { title?: { content?: string }; subtitle?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };

  assert.strictEqual(card.header?.title?.content, 'project-a | 🤖 Qwen');
  assert.strictEqual(card.header?.subtitle?.content, 'Rate Limited');
  const bodyText = JSON.stringify(card.body?.elements ?? []);
  assert.ok(bodyText.includes('Qwen 请求频率超限，请稍后再试。'));
  assert.ok(bodyText.includes('可在 **30 秒** 后重试'));
});

test('buildUnboundCard builds card with message', () => {
  const card = JSON.parse(
    buildUnboundCard({
      sessionId: 'sess_unbound',
      senderId: 'user_123',
      bridgeCommands: [],
      codexCommands: [],
    }).content
  );
  assert.strictEqual(card.header?.title?.content, 'lark-agent-bridge');
  assert.ok(JSON.stringify(card.body?.elements).includes('尚未绑定'));
});

test('buildUnknownCommandCard builds card with command', () => {
  const card = JSON.parse(
    buildUnknownCommandCard({
      unknownCommand: '//invalid',
      bridgeCommands: [],
      codexCommands: [],
      projectId: 'project-a',
      statusLabel: 'working',
      rateBar: '...',
      ratePercent: 0,
      cwd: '...',
      model: '...',
      sessionId: '...',
      gitStatus: 'clean',
      gitBranch: 'main',
      gitDiffStat: '',
    }).content
  );
  assert.strictEqual(card.header?.title?.content, 'unknown command | project-a');
  assert.strictEqual(card.header?.subtitle?.content, 'working | ... 0% left');
  assert.ok(JSON.stringify(card.body?.elements).includes('## 桥接命令'));
});

test('buildThreadListCard builds card with thread list', () => {
  const card = JSON.parse(
    buildThreadListCard({
      threads: [
        {
          id: 'thread-1',
          name: 'Thread 1',
          description: 'Desc 1',
          status: 'running',
          createdAt: new Date(),
        },
      ],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, '🧵 后台任务');
  assert.ok(JSON.stringify(card.body?.elements).includes('Thread 1'));
  assert.ok(JSON.stringify(card.body?.elements).includes('thread-1'));
});

test('buildFileReceivedCard builds card with file list', () => {
  const card = JSON.parse(
    buildFileReceivedCard({
      files: [
        { originalName: 'test.txt', savedPath: '/tmp/test.txt', fileSize: 1024, attachmentType: 'file' },
      ],
    }).content,
  );

  assert.strictEqual(card.header?.title?.content, '文件上传');
  assert.ok(JSON.stringify(card.body?.elements).includes('test.txt'));
});
