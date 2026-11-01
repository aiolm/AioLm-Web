import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DESKTOP_RELEASE_VERSION } from "@/lib/desktop-release";
import { InstallCommand, installTabForKey } from "@/components/install-command";

const messages = {
  windows: "Windows app", macos: "macOS app", linux: "Linux app", title: "Install AioLM",
  copy: "Copy", copied: "Copied!", copyFailed: "Select the command to copy it manually.", download: "Downloads",
  windowsRequirements: "Windows x64 · EXE / MSI", windowsInstructions: "Run this command in PowerShell.", windowsWarning: "The Windows installer has no publisher signature.",
  macosRequirements: "macOS 13.3+ · Apple silicon / Intel · DMG", macosInstructions: "Run this command in Terminal.", macosGuide: "macOS installation guide",
  macosWarning: "The Mac app is ad-hoc signed and not notarized by Apple.",
  linuxRequirements: "Ubuntu 24.04+ · x86_64 · DEB / AppImage", linuxInstructions: "Download and verify a DEB first.", linuxGuide: "Linux installation guide",
};

describe("install platform tabs", () => {
  it("puts only the selected platform in the Tab order", () => {
    const html = renderToStaticMarkup(<InstallCommand locale="en" messages={messages} macosGuideUrl="/en/guides/install#macos" linuxGuideUrl="/en/guides/install#linux" />);
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
    expect(tabs.map(tab => tab.match(/tabindex="(-?\d)"/)?.[1])).toEqual(["0", "-1", "-1"]);
  });
  it("keeps each tab's panel mounted while hiding inactive panel content", () => {
    const html = renderToStaticMarkup(<InstallCommand locale="en" messages={messages} macosGuideUrl="/en/guides/install#macos" linuxGuideUrl="/en/guides/install#linux" />);
    for (const os of ["windows", "macos", "linux"]) {
      expect(html).toContain(`aria-controls="panel-${os}"`);
      expect(html).toContain(`id="panel-${os}" role="tabpanel" aria-labelledby="tab-${os}"`);
    }
    expect(html).toContain('aria-labelledby="tab-macos" hidden="" tabindex="0"');
    expect(html).toContain('aria-labelledby="tab-linux" hidden="" tabindex="0"');
  });
  it("provides a Linux command and real download/guide destinations", () => {
    const html = renderToStaticMarkup(<InstallCommand locale="en" messages={messages} macosGuideUrl="/en/guides/install#macos" linuxGuideUrl="/en/guides/install#linux" />);
    expect(html).toContain("sudo apt install ./AioLM_*_amd64.deb");
    expect(html).toContain(`href="https://github.com/aiolm/AioLM/releases/download/v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_amd64.deb"`);
    expect(html).not.toContain('href="https://github.com/aiolm/AioLM/releases/latest"');
    expect(html).toContain('href="/en/guides/install#linux"');
  });
  it("provides the verified macOS installer command and real download/guide destinations", () => {
    const html = renderToStaticMarkup(<InstallCommand locale="en" messages={messages} macosGuideUrl="/en/guides/install#macos" linuxGuideUrl="/en/guides/install#linux" />);
    const panel = html.match(/<div id="panel-macos"[^]*?<div id="panel-linux"/)?.[0] ?? "";
    expect(panel).toContain("curl -fsSL https://github.com/aiolm/AioLM/releases/latest/download/install.sh | bash");
    expect(panel).toContain(`href="https://github.com/aiolm/AioLM/releases/download/v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_aarch64.dmg"`);
    expect(panel).toContain(`AioLM_${DESKTOP_RELEASE_VERSION}_x64.dmg`);
    expect(panel).toContain('href="/en/guides/install#macos"');
  });
  it("moves between platforms with arrows that wrap, and jumps with Home and End", () => {
    expect(installTabForKey("ArrowRight", "windows")).toBe("macos");
    expect(installTabForKey("ArrowRight", "linux")).toBe("windows");
    expect(installTabForKey("ArrowLeft", "windows")).toBe("linux");
    expect(installTabForKey("End", "windows")).toBe("linux");
    expect(installTabForKey("Home", "linux")).toBe("windows");
  });
  it("names the tablist once and keeps an empty status region ready for the copy confirmation", () => {
    const html = renderToStaticMarkup(<InstallCommand locale="en" messages={messages} macosGuideUrl="/en/guides/install#macos" linuxGuideUrl="/en/guides/install#linux" />);
    expect(html).toMatch(/role="tablist" aria-label="Install AioLM"/);
    expect(html).toContain('<span class="sr-only" role="status"></span>');
  });
  it("leaves other keys, including Tab and activation keys, to the browser", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "a"]) expect(installTabForKey(key, "macos")).toBeNull();
  });
});
