import { describe, expect, it } from "vitest";
import { activePath, deepestLeaf, findForks, isSaved, linkMessages } from "@/services/branches";
import type { Message } from "@/types";

function message(id: string, parentId: string | null | undefined, createdAt: number, patch: Partial<Message> = {}): Message {
  return { id, conversationId: "c", parentId, role: "user", content: id, status: "complete", createdAt, updatedAt: createdAt, ...patch };
}

const ids = (messages: readonly Message[]): string[] => messages.map((item) => item.id);

// u1 ─ a1 ─ u2 ─ a2
//    └ a1b ─ u3
const tree = [message("u1", null, 1), message("a1", "u1", 2), message("u2", "a1", 3), message("a2", "u2", 4), message("a1b", "u1", 5), message("u3", "a1b", 6)];

describe("linkMessages", () => {
  it("turns a chat saved as a flat list into a single line", () => {
    const linked = linkMessages([message("a", undefined, 1), message("b", undefined, 2), message("c", undefined, 3)]);
    expect(linked.map((item) => item.parentId)).toEqual([null, "a", "b"]);
  });

  it("leaves recorded parents alone", () => {
    expect(linkMessages(tree)).toEqual(tree);
  });

  it("handles an old chat that later gained a branch", () => {
    const linked = linkMessages([message("a", undefined, 1), message("b", undefined, 2), message("b2", "a", 3)]);
    expect(linked.map((item) => item.parentId)).toEqual([null, "a", "a"]);
  });
});

describe("activePath", () => {
  it("defaults to the branch holding the newest message", () => {
    expect(ids(activePath(tree))).toEqual(["u1", "a1b", "u3"]);
  });

  it("follows a chosen leaf", () => {
    expect(ids(activePath(tree, "a2"))).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("falls back to the newest branch when the leaf was deleted", () => {
    expect(ids(activePath(tree, "gone"))).toEqual(["u1", "a1b", "u3"]);
  });

  it("survives a cycle in imported data", () => {
    expect(ids(activePath([message("a", "b", 1), message("b", "a", 2)]))).toEqual(["a", "b"]);
  });

  it("is empty for an empty chat", () => {
    expect(activePath([])).toEqual([]);
  });
});

describe("deepestLeaf", () => {
  it("walks down to where a version ended up", () => {
    expect(deepestLeaf(tree, "a1")).toBe("a2");
    expect(deepestLeaf(tree, "a1b")).toBe("u3");
  });

  it("returns the message itself when nothing follows it", () => {
    expect(deepestLeaf(tree, "a2")).toBe("a2");
  });
});

describe("findForks", () => {
  it("lists versions oldest first, for those messages only", () => {
    const forks = findForks(tree);
    expect(forks.a1).toEqual(["a1", "a1b"]);
    expect(forks.a1b).toEqual(["a1", "a1b"]);
    expect(forks.u1).toBeUndefined();
    expect(forks.u2).toBeUndefined();
  });

  it("treats two roots as versions of the first message", () => {
    expect(findForks([message("r1", null, 1), message("r2", null, 2)]).r2).toEqual(["r1", "r2"]);
  });
});

describe("isSaved", () => {
  it("counts an old thumbs up, and only that", () => {
    expect(isSaved(message("a", null, 1, { feedback: "good" }))).toBe(true);
    expect(isSaved(message("a", null, 1, { feedback: "bad" }))).toBe(false);
    expect(isSaved(message("a", null, 1, { saved: false, feedback: "good" }))).toBe(false);
  });
});
