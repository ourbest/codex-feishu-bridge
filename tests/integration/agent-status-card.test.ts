import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { buildAgentStatusCard } from '../../src/adapters/lark/cards.ts';

describe('Agent Status Card Integration', () => {
  it('should render card with all fields populated', () => {
    const card = buildAgentStatusCard({
      projectId: 'test-project',
      statusLabel: 'working',
      bodyMarkdown: '正在处理中...',
      rateBar: '[████████░░]',
      ratePercent: 80,
      cwd: '/workspace/test',
      model: 'opus-4-6',
      sessionId: 'sess_test123',
      gitStatus: 'modified',
      gitBranch: 'main',
      gitDiffStat: '+10 -5',
      backgroundTasks: [
        { id: '1', name: 'analysis', status: 'running' },
        { id: '2', name: 'backup', status: 'paused' },
      ],
      template: 'blue',
    });

    const content = JSON.parse(card.content);

    // Verify header - subtitle includes rate info
    assert.strictEqual(content.header.title.content, 'test-project | 🤖 Claude Code');
    assert.strictEqual(content.header.subtitle.content, 'working | [████████░░] 80% left');

    // Verify body contains the processing content
    const bodyContent = content.body.elements[0].content;
    assert.ok(bodyContent.includes('正在处理中...'));
    // Agent status info is in footer (elements after hr)
    const bodyText = JSON.stringify(content.body.elements);
    assert.ok(bodyText.includes('/workspace/test'));
    assert.ok(bodyText.includes('opus-4-6'));
    assert.ok(bodyText.includes('sess_test123'));
    assert.ok(bodyText.includes('git: ✗ | branch: main | +10 -5'));
    assert.ok(bodyText.includes('analysis [running]'));
    assert.ok(bodyText.includes('backup [paused]'));
  });

  it('should render card with minimal fields', () => {
    const card = buildAgentStatusCard({
      projectId: 'minimal-project',
      statusLabel: 'done',
      bodyMarkdown: '任务完成',
      rateBar: '[██████████]',
      ratePercent: 100,
      cwd: '/workspace/minimal',
      model: 'sonnet-4',
      sessionId: 'sess_minimal',
      gitStatus: 'clean',
      gitBranch: 'develop',
      gitDiffStat: '',
    });

    const content = JSON.parse(card.content);

    assert.strictEqual(content.header.title.content, 'minimal-project | 🤖 Claude Code');
    assert.strictEqual(content.header.subtitle.content, 'done | [██████████] 100% left');

    const bodyText = JSON.stringify(content.body.elements);
    assert.ok(bodyText.includes('/workspace/minimal'));
    assert.ok(bodyText.includes('sonnet-4'));
    assert.ok(bodyText.includes('sess_minimal'));
    assert.ok(bodyText.includes('git: ✓ | branch: develop |'));
  });
});