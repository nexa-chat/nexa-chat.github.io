export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Incremental Server-Sent Events decoder. It accepts arbitrary chunk boundaries, including
 * splits inside a line or a CRLF pair.
 */
export class SseDecoder {
  private buffer = "";
  private eventName: string | undefined;
  private dataLines: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    let start = 0;

    for (;;) {
      const lineEnd = this.findLineEnd(start);
      if (lineEnd === null) break;
      this.consumeLine(this.buffer.slice(start, lineEnd.index), events);
      start = lineEnd.next;
    }

    this.buffer = this.buffer.slice(start);
    return events;
  }

  /** Flushes a final event that was not closed by a blank line. */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      this.consumeLine(this.buffer.replace(/\r$/, ""), events);
      this.buffer = "";
    }
    this.dispatch(events);
    return events;
  }

  private findLineEnd(from: number): { index: number; next: number } | null {
    for (let i = from; i < this.buffer.length; i += 1) {
      const char = this.buffer[i];
      if (char === "\n") return { index: i, next: i + 1 };
      if (char === "\r") {
        // A trailing CR may be the first half of a CRLF split across chunks.
        if (i + 1 === this.buffer.length) return null;
        return { index: i, next: this.buffer[i + 1] === "\n" ? i + 2 : i + 1 };
      }
    }
    return null;
  }

  private consumeLine(line: string, events: SseEvent[]): void {
    if (line === "") {
      this.dispatch(events);
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") this.dataLines.push(value);
    else if (field === "event") this.eventName = value;
  }

  private dispatch(events: SseEvent[]): void {
    if (this.dataLines.length > 0) {
      events.push({ event: this.eventName, data: this.dataLines.join("\n") });
    }
    this.dataLines = [];
    this.eventName = undefined;
  }
}

/** Splits newline-delimited JSON, keeping an incomplete trailing line for the next chunk. */
export class NdjsonDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim().length > 0);
  }

  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
