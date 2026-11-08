const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Splits Markdown at blank lines that sit outside code fences and math blocks. Finished
 * blocks keep the same string while a response streams, so memoised rendering skips them
 * and only the last block is parsed on each update.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let inMath = false;

  const flush = (): void => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of markdown.split("\n")) {
    if (fence) {
      current.push(line);
      const closing = FENCE.exec(line);
      if (closing?.[1] && closing[1][0] === fence[0] && closing[1].length >= fence.length && line.trim() === closing[1]) {
        fence = null;
      }
      continue;
    }

    if (inMath) {
      current.push(line);
      if (line.trim().endsWith("$$")) inMath = false;
      continue;
    }

    const opening = FENCE.exec(line);
    if (opening?.[1]) {
      fence = opening[1];
      current.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("$$") && !(trimmed.length > 2 && trimmed.endsWith("$$"))) {
      inMath = true;
      current.push(line);
      continue;
    }

    if (trimmed === "") {
      flush();
      continue;
    }
    current.push(line);
  }

  flush();
  return mergeLists(blocks);
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;

/** Rejoins a loose list split at its blank lines, so ordered numbering stays correct. */
function mergeLists(blocks: string[]): string[] {
  const merged: string[] = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    const continuesList = previous !== undefined && LIST_ITEM.test(previous) && (LIST_ITEM.test(block) || /^\s{2,}\S/.test(block));
    if (continuesList) merged[merged.length - 1] = `${previous}\n\n${block}`;
    else merged.push(block);
  }
  return merged;
}

const INLINE_MATH = /\\\(|\\\[|\$\$|(^|[^\\\w$])\$(?=\S)[^$\n]*\S\$(?![\d$])/;
const CODE_SPANS = /(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`[^`\n]*`)/;

export function hasMath(markdown: string): boolean {
  return markdown.split(CODE_SPANS).some((part, index) => index % 2 === 0 && INLINE_MATH.test(part));
}

/** Models write \( \) and \[ \]. remark-math reads dollar delimiters. Code is left alone. */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown
    .split(CODE_SPANS)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, body: string) => `$$${body}$$`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, body: string) => `$${body.trim()}$`);
    })
    .join("");
}
