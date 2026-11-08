const OPEN = "<think>";
const CLOSE = "</think>";

export interface FilteredDelta {
  text: string;
  reasoning: string;
}

/** Length of the longest suffix of `value` that could be the start of `tag`. */
function partialTagLength(value: string, tag: string): number {
  for (let length = Math.min(value.length, tag.length - 1); length > 0; length -= 1) {
    if (tag.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

/**
 * Several local models write their reasoning inline as <think>...</think> instead of using a
 * separate field. This moves it out of the answer. A tag can arrive split across chunks, so
 * anything that might be part of one waits for the next chunk. Only a block at the very
 * start counts, so an answer that merely mentions the tag is left alone.
 */
export class ThinkFilter {
  private state: "start" | "thinking" | "answer" = "start";
  private buffer = "";

  push(delta: string): FilteredDelta {
    this.buffer += delta;

    if (this.state === "start") {
      const trimmed = this.buffer.trimStart();
      if (trimmed.startsWith(OPEN)) {
        this.buffer = trimmed.slice(OPEN.length);
        this.state = "thinking";
      } else if (trimmed.length === 0 || OPEN.startsWith(trimmed)) {
        return { text: "", reasoning: "" };
      } else {
        this.state = "answer";
      }
    }

    if (this.state === "thinking") {
      const end = this.buffer.indexOf(CLOSE);
      if (end === -1) {
        const keep = partialTagLength(this.buffer, CLOSE);
        const reasoning = this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return { text: "", reasoning };
      }
      const reasoning = this.buffer.slice(0, end);
      const text = this.buffer.slice(end + CLOSE.length).trimStart();
      this.buffer = "";
      this.state = "answer";
      return { text, reasoning };
    }

    const text = this.buffer;
    this.buffer = "";
    return { text, reasoning: "" };
  }

  /** Releases anything held back when the stream ends. */
  flush(): FilteredDelta {
    const rest = this.buffer;
    this.buffer = "";
    return this.state === "thinking" ? { text: "", reasoning: rest } : { text: rest, reasoning: "" };
  }
}
