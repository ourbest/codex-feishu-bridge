import { marked } from 'marked';

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

function mergeStyles(existing: Array<'bold' | 'italic' | 'strikethrough'>, next: Array<'bold' | 'italic' | 'strikethrough'>) {
  return Array.from(new Set([...existing, ...next]));
}

function makeText(text: string, style: Array<'bold' | 'italic' | 'strikethrough'> = []): FeishuPostTag {
  return style.length === 0 ? { tag: 'text', text } : { tag: 'text', text, style };
}

function parseInline(tokens: marked.Token[], style: Array<'bold' | 'italic' | 'strikethrough'> = []): FeishuPostTag[] {
  const res: FeishuPostTag[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        // Check for nested tokens (inline formatting)
        if ('tokens' in t && Array.isArray((t as marked.Tokens.Text).tokens) && (t as marked.Tokens.Text).tokens!.length > 0) {
          res.push(...parseInline((t as marked.Tokens.Text).tokens!, style));
        } else {
          res.push(makeText(t.text, style));
        }
        break;
      }
      case 'strong':
        res.push(...parseInline((t as marked.Token & { tokens?: marked.Token[] }).tokens ?? [], mergeStyles(style, ['bold'])));
        if (!('tokens' in t) || !(t as marked.Token & { tokens?: marked.Token[] }).tokens?.length) {
          res.push(makeText((t as marked.Tokens.Strong).text, mergeStyles(style, ['bold'])));
        }
        break;
      case 'em':
        res.push(...parseInline((t as marked.Token & { tokens?: marked.Token[] }).tokens ?? [], mergeStyles(style, ['italic'])));
        if (!('tokens' in t) || !(t as marked.Token & { tokens?: marked.Token[] }).tokens?.length) {
          res.push(makeText((t as marked.Tokens.Em).text, mergeStyles(style, ['italic'])));
        }
        break;
      case 'link': res.push({ tag: 'a', text: t.text, href: t.href ?? '' }); break;
      case 'codespan':
        res.push(makeText(`\`${t.text}\``, style));
        break;
      case 'del':
        res.push(...parseInline((t as marked.Token & { tokens?: marked.Token[] }).tokens ?? [], mergeStyles(style, ['strikethrough'])));
        if (!('tokens' in t) || !(t as marked.Token & { tokens?: marked.Token[] }).tokens?.length) {
          res.push(makeText((t as marked.Tokens.Del).text, mergeStyles(style, ['strikethrough'])));
        }
        break;
      case 'image': {
        const alt = t.text?.trim();
        const href = t.href?.trim();
        const fallback = alt ? `![${alt}]` : href ?? '';
        res.push(makeText(fallback || '[image]', style));
        break;
      }
      default:
        if ('text' in t && t.text) res.push(makeText(t.text, style));
    }
  }
  return res;
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
