import { describe, expect, it } from "vitest";
import { NdjsonDecoder, SseDecoder } from "@/lib/sse";

describe("SseDecoder", () => {
  it("parses a complete event", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: {"a":1}\n\n')).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it("reassembles a line split across chunks at any position", () => {
    const payload = 'event: delta\ndata: {"text":"hello"}\n\n';
    for (let split = 1; split < payload.length; split += 1) {
      const decoder = new SseDecoder();
      const events = [...decoder.push(payload.slice(0, split)), ...decoder.push(payload.slice(split))];
      expect(events).toEqual([{ event: "delta", data: '{"text":"hello"}' }]);
    }
  });

  it("handles CRLF, including a pair split across chunks", () => {
    const decoder = new SseDecoder();
    const events = [...decoder.push("data: one\r"), ...decoder.push("\n\r\n"), ...decoder.push("data: two\r\n\r\n")];
    expect(events.map((event) => event.data)).toEqual(["one", "two"]);
  });

  it("joins multi-line data and ignores comments", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(": keep-alive\ndata: a\ndata: b\n\n")).toEqual([{ event: undefined, data: "a\nb" }]);
  });

  it("emits a final event that has no closing blank line on flush", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data: tail")).toEqual([]);
    expect(decoder.flush()).toEqual([{ event: undefined, data: "tail" }]);
  });

  it("does not leak an event name into the next event", () => {
    const decoder = new SseDecoder();
    const events = decoder.push("event: first\ndata: 1\n\ndata: 2\n\n");
    expect(events).toEqual([{ event: "first", data: "1" }, { event: undefined, data: "2" }]);
  });
});

describe("NdjsonDecoder", () => {
  it("keeps a partial line until it completes", () => {
    const decoder = new NdjsonDecoder();
    expect(decoder.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(decoder.push(":2}\n")).toEqual(['{"b":2}']);
  });

  it("flushes a trailing line without a newline", () => {
    const decoder = new NdjsonDecoder();
    decoder.push('{"a":1}');
    expect(decoder.flush()).toEqual(['{"a":1}']);
  });
});
