type FeishuPostTag =
  | { tag: 'text'; text: string; style?: Array<'bold' | 'italic' | 'strikethrough'> }
  | { tag: 'a'; text: string; href: string }
  | { tag: 'at'; user_id: string }
  | { tag: 'md'; text: string };

interface FeishuPostContent {
  tag: 'post';
  post: {
    'zh_cn': {
      title: string;
      content: FeishuPostTag[][];
    };
  };
}

function mdToFeishuPost(md: string): FeishuPostContent {
  return {
    tag: 'post',
    post: {
      'zh_cn': {
        title: '',
        content: [[{ tag: 'md', text: md }]],
      },
    },
  };
}

export function isMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/);
  return (
    /```/.test(text) ||
    /`[^`]+`/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /__[^_]+__/.test(text) ||
    /\*[^*\s][^*]*\*/.test(text) ||
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    lines.some((line) => /^(\s*)(-|\*|\d+\.)\s+\S/.test(line)) ||
    /(^|\n)>\s+\S/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  );
}

export function markdownToFeishuPost(text: string): FeishuPostContent {
  return mdToFeishuPost(text);
}

export function buildFeishuPostMessage(md: string, title = '') {
  const post = mdToFeishuPost(md);
  post.post.zh_cn.title = title;
  return {
    msg_type: 'post',
    content: JSON.stringify({ zh_cn: post.post.zh_cn }),
  };
}
