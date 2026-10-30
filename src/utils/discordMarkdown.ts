/**
 * Parses Discord-flavored markdown text into sanitized HTML.
 *
 * Supported Discord markdown formatting:
 * - Code blocks: ```lang ... ``` or ``` ... ```
 * - Inline code: `...`
 * - Spoiler: ||...||
 * - Bold italics: ***...***
 * - Bold: **...**
 * - Underline: __...__
 * - Italics: *...* or _..._
 * - Strikethrough: ~~...~~
 * - Subtext: -# ...
 * - Blockquotes: > ... or >>> ...
 * - Headers: # ... (H1), ## ... (H2), ### ... (H3)
 * - Links: [label](url) and bare URLs https://...
 * - Line breaks preserved
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseDiscordMarkdown(input: string): string {
  if (!input) return '';

  // Extract codeblocks first so nested markdown is not processed inside them
  const codeBlocks: string[] = [];
  let text = input.replace(/```(?:([a-zA-Z0-9_+-]+)?\n)?([\s\S]*?)```/g, (_match, lang, code) => {
    const escapedCode = escapeHtml(code ?? '');
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
    const placeholder = `@@@CODEBLOCK_${codeBlocks.length}@@@`;
    codeBlocks.push(`<pre class="discord-code-block"${langAttr}><code>${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const placeholder = `@@@INLINECODE_${inlineCodes.length}@@@`;
    inlineCodes.push(`<code class="discord-inline-code">${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // Split lines to process block-level elements: headers, blockquotes, subtext
  const lines = text.split('\n');
  const processedLines: string[] = [];
  let inMultiQuote = false;
  let multiQuoteLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    if (inMultiQuote) {
      multiQuoteLines.push(rawLine);
      continue;
    }

    // Multi-line blockquote start: >>>
    if (rawLine.startsWith('>>> ')) {
      inMultiQuote = true;
      multiQuoteLines.push(rawLine.slice(4));
      continue;
    }
    if (rawLine === '>>>') {
      inMultiQuote = true;
      multiQuoteLines.push('');
      continue;
    }

    // Single line blockquote: >
    if (rawLine.startsWith('&gt; ') || rawLine.startsWith('> ')) {
      const quoteContent = rawLine.startsWith('&gt; ') ? rawLine.slice(5) : rawLine.slice(2);
      processedLines.push(`<blockquote class="discord-quote">${parseInline(quoteContent)}</blockquote>`);
      continue;
    }

    // Subtext: -#
    if (rawLine.startsWith('-# ')) {
      const subtextContent = rawLine.slice(3);
      processedLines.push(`<small class="discord-subtext">${parseInline(subtextContent)}</small>`);
      continue;
    }

    // Headers: #, ##, ###
    const h3Match = rawLine.match(/^### (.*)$/);
    if (h3Match) {
      processedLines.push(`<h3 class="discord-h3">${parseInline(h3Match[1])}</h3>`);
      continue;
    }
    const h2Match = rawLine.match(/^## (.*)$/);
    if (h2Match) {
      processedLines.push(`<h2 class="discord-h2">${parseInline(h2Match[1])}</h2>`);
      continue;
    }
    const h1Match = rawLine.match(/^# (.*)$/);
    if (h1Match) {
      processedLines.push(`<h1 class="discord-h1">${parseInline(h1Match[1])}</h1>`);
      continue;
    }

    processedLines.push(parseInline(rawLine));
  }

  if (inMultiQuote) {
    const formattedQuote = multiQuoteLines.map((line) => parseInline(line)).join('<br />');
    processedLines.push(`<blockquote class="discord-quote">${formattedQuote}</blockquote>`);
  }

  let html = processedLines.join('<br />');

  // Restore inline codes
  inlineCodes.forEach((code, idx) => {
    html = html.replace(`@@@INLINECODE_${idx}@@@`, () => code);
  });

  // Restore code blocks
  codeBlocks.forEach((code, idx) => {
    html = html.replace(`@@@CODEBLOCK_${idx}@@@`, () => code);
  });

  return html;
}

function parseInline(content: string): string {
  // Escape HTML characters in content to prevent XSS
  let text = escapeHtml(content);

  // Masked links [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    return `<a href="${url}" class="discord-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Auto-link URLs (excluding ones already inside tags or placeholders)
  text = text.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, (_match, url) => {
    return `<a href="${url}" class="discord-link" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  // Spoilers: ||text||
  text = text.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="discord-spoiler" role="button" tabindex="0">$1</span>');

  // Bold Italics: ***text***
  text = text.replace(/\*\*\*([^\*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold: **text**
  text = text.replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>');

  // Underline bold: __**text**__
  text = text.replace(/__\*\*([^\*]+?)\*\*__/g, '<u><strong>$1</strong></u>');

  // Underline: __text__
  text = text.replace(/__([^_]+?)__/g, '<u>$1</u>');

  // Italics: *text* or _text_
  text = text.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
  text = text.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  text = text.replace(/~~([^~]+?)~~/g, '<del>$1</del>');

  return text;
}
