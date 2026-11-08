import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PromptInput, type PromptInputProps } from "@/components/ui/ai-chat-input";

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

function setup(overrides: Partial<PromptInputProps> = {}): PromptInputProps {
  const props: PromptInputProps = {
    inputId: "input",
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    placeholder: "Ask anything",
    enterKeyHint: "send",
    onKeyDown: vi.fn(),
    onPaste: vi.fn(),
    open: true,
    onOpenChange: vi.fn(),
    canSubmit: false,
    generating: false,
    disabled: false,
    attachments: [],
    onAttach: vi.fn(),
    onRemoveAttachment: vi.fn(),
    modelControl: <span>Model</span>,
    effort: { label: "Balanced", level: 1, onCycle: vi.fn() },
    voice: { supported: false, recording: false, levels: [0, 0, 0, 0, 0], start: vi.fn(), stop: vi.fn() },
    ...overrides,
  };
  render(<PromptInput {...props} />);
  return props;
}

describe("PromptInput action button", () => {
  it("sends when there is something to send", () => {
    const props = setup({ canSubmit: true });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(props.onSubmit).toHaveBeenCalled();
  });

  it("is disabled with nothing to send and no voice support", () => {
    setup();
    expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty("disabled", true);
  });

  it("offers dictation only when the browser supports it", () => {
    const start = vi.fn();
    setup({ voice: { supported: true, recording: false, levels: [0, 0, 0, 0, 0], start, stop: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "Dictate a message" }));
    expect(start).toHaveBeenCalled();
  });

  it("stops generation first, whatever else is true", () => {
    const props = setup({ generating: true, canSubmit: true });
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(props.onStop).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("stops dictation while recording", () => {
    const stop = vi.fn();
    setup({ voice: { supported: true, recording: true, levels: [0, 0, 0, 0, 0], start: vi.fn(), stop } });
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(stop).toHaveBeenCalled();
  });
});

describe("PromptInput content", () => {
  it("cycles the response style", () => {
    const onCycle = vi.fn();
    setup({ effort: { label: "Fast", level: 0, onCycle } });
    fireEvent.click(screen.getByTitle("Response style"));
    expect(onCycle).toHaveBeenCalled();
  });

  it("shows each file's name and detail, and removes it", () => {
    const props = setup({ attachments: [{ id: "a", name: "report.pdf", detail: "PDF, 2 MB" }] });
    expect(screen.getByText("report.pdf")).toBeDefined();
    expect(screen.getByText("PDF, 2 MB")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remove report.pdf" }));
    expect(props.onRemoveAttachment).toHaveBeenCalledWith("a");
  });

  it("loads nothing from a third-party server", () => {
    setup({ attachments: [{ id: "a", name: "a.png", detail: "PNG", previewUrl: "blob:local" }] });
    const sources = [...document.querySelectorAll("img")].map((image) => image.getAttribute("src") ?? "");
    expect(sources.every((source) => source.startsWith("blob:"))).toBe(true);
  });
});
