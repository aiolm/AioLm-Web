import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallCommand, installTabForKey } from "@/components/install-command";

const messages = {
  windows: "Windows app", macos: "macOS planned", linux: "Linux planned", title: "Install AioLM",
  copy: "Copy", copied: "Copied!", copyFailed: "Select the command to copy it manually.", macosPlanned: "macOS support is planned.", linuxPlanned: "Linux support is planned.",
};

describe("install platform tabs", () => {
  it("puts only the selected platform in the Tab order", () => {
    const html = renderToStaticMarkup(<InstallCommand messages={messages} />);
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
    expect(tabs.map(tab => tab.match(/tabindex="(-?\d)"/)?.[1])).toEqual(["0", "-1", "-1"]);
  });
  it("keeps each tab's panel mounted while hiding inactive panel content", () => {
    const html = renderToStaticMarkup(<InstallCommand messages={messages} />);
    for (const os of ["windows", "macos", "linux"]) {
      expect(html).toContain(`aria-controls="panel-${os}"`);
      expect(html).toContain(`id="panel-${os}" role="tabpanel" aria-labelledby="tab-${os}"`);
    }
    expect(html).toContain('aria-labelledby="tab-macos" hidden="" tabindex="0"');
    expect(html).toContain('aria-labelledby="tab-linux" hidden="" tabindex="0"');
  });
  it("moves between platforms with arrows that wrap, and jumps with Home and End", () => {
    expect(installTabForKey("ArrowRight", "windows")).toBe("macos");
    expect(installTabForKey("ArrowRight", "linux")).toBe("windows");
    expect(installTabForKey("ArrowLeft", "windows")).toBe("linux");
    expect(installTabForKey("End", "windows")).toBe("linux");
    expect(installTabForKey("Home", "linux")).toBe("windows");
  });
  it("names the tablist once and keeps an empty status region ready for the copy confirmation", () => {
    const html = renderToStaticMarkup(<InstallCommand messages={messages} />);
    expect([...html.matchAll(/aria-label="([^"]*)"/g)].map(match => match[1])).toEqual(["Install AioLM"]);
    expect(html).toMatch(/role="tablist" aria-label="Install AioLM"/);
    expect(html).toContain('<span class="sr-only" role="status"></span>');
    // The copy button is named by its visible text, not by a duplicate label.
    expect(html).toMatch(/<button type="button" class="install-copy-button "><svg[^]*?<span>Copy<\/span><\/button>/);
  });
  it("leaves other keys, including Tab and activation keys, to the browser", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "a"]) expect(installTabForKey(key, "macos")).toBeNull();
  });
});
