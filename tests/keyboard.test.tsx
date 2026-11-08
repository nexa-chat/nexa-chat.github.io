import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Field, Segmented } from "@/components/ui/field";
import { Menu } from "@/components/ui/menu";

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

function Theme() {
  const [value, setValue] = useState("dark");
  return (
    <Segmented
      label="Theme"
      value={value}
      onChange={setValue}
      options={[
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "system", label: "System" },
      ]}
    />
  );
}

function MenuHarness({ onSelect }: { onSelect: () => void }) {
  const [open, setOpen] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={trigger} type="button">
        Actions
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={trigger} label="Actions menu" items={[{ id: "rename", label: "Rename", onSelect }]} />
    </>
  );
}

describe("radio groups", () => {
  it("are a single tab stop", () => {
    render(<Theme />);
    const stops = screen.getAllByRole("radio").filter((radio) => radio.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it("move and select with the arrow keys, wrapping at the ends", () => {
    render(<Theme />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    dark.focus();

    fireEvent.keyDown(dark, { key: "ArrowRight" });
    const light = screen.getByRole("radio", { name: "Light" });
    expect(light.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(light);

    fireEvent.keyDown(light, { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("Field", () => {
  it("only uses a label element when there is a control to point at", () => {
    const { container } = render(
      <Field label="Theme">
        <span />
      </Field>,
    );
    expect(container.querySelector("label")).toBeNull();
  });
});

describe("Menu", () => {
  it("cancels the browser's own Escape, which would close the surrounding dialog", () => {
    render(<MenuHarness onSelect={() => {}} />);
    const notCancelled = fireEvent.keyDown(document.body, { key: "Escape" });
    expect(notCancelled).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("returns focus to its trigger after a selection", () => {
    const onSelect = vi.fn();
    render(<MenuHarness onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" }));
  });

  it("returns focus to its trigger when tabbing out", () => {
    render(<MenuHarness onSelect={() => {}} />);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Rename" }), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" }));
  });
});
