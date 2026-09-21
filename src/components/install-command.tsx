"use client";

import { useState } from "react";

const WINDOWS_INSTALL_CMD =
  'powershell -ExecutionPolicy Bypass -Command "irm https://github.com/aiolm/AioLM/releases/latest/download/install.ps1 | iex"';

export interface InstallMessages {
  windows: string;
  macos: string;
  linux: string;
  title: string;
  copy: string;
  copied: string;
  macosPlanned: string;
  linuxPlanned: string;
}

export function InstallCommand({ messages }: { messages: InstallMessages }): React.JSX.Element {
  const [selectedOs, setSelectedOs] = useState<"windows" | "macos" | "linux">("windows");
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(WINDOWS_INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort clipboard write
    }
  };

  return (
    <section className="install-box" aria-label={messages.title}>
      <div className="install-tabs" role="tablist" aria-label={messages.title}>
        <button
          type="button"
          role="tab"
          id="tab-windows"
          aria-selected={selectedOs === "windows"}
          aria-controls="panel-windows"
          className={`install-tab ${selectedOs === "windows" ? "active" : ""}`}
          onClick={() => setSelectedOs("windows")}
        >
          <WindowsIcon />
          <span>{messages.windows}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-macos"
          aria-selected={selectedOs === "macos"}
          aria-controls="panel-macos"
          className={`install-tab ${selectedOs === "macos" ? "active" : ""}`}
          onClick={() => setSelectedOs("macos")}
        >
          <AppleIcon />
          <span>macOS</span>
          <span className="install-tab-badge">{messages.macos}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-linux"
          aria-selected={selectedOs === "linux"}
          aria-controls="panel-linux"
          className={`install-tab ${selectedOs === "linux" ? "active" : ""}`}
          onClick={() => setSelectedOs("linux")}
        >
          <LinuxIcon />
          <span>Linux</span>
          <span className="install-tab-badge">{messages.linux}</span>
        </button>
      </div>

      <div className="install-panel-container">
        {selectedOs === "windows" ? (
          <div id="panel-windows" role="tabpanel" aria-labelledby="tab-windows" className="install-panel">
            <div className="install-cmd-row">
              <code className="install-cmd-code" title={WINDOWS_INSTALL_CMD}>
                <span className="install-cmd-prompt">&gt;</span> {WINDOWS_INSTALL_CMD}
              </code>
              <button
                type="button"
                className={`install-copy-button ${copied ? "copied" : ""}`}
                onClick={handleCopy}
                aria-label={copied ? messages.copied : messages.copy}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span>{copied ? messages.copied : messages.copy}</span>
              </button>
            </div>
          </div>
        ) : selectedOs === "macos" ? (
          <div id="panel-macos" role="tabpanel" aria-labelledby="tab-macos" className="install-panel install-panel-planned">
            <p className="install-planned-note">
              <AppleIcon />
              <span>{messages.macosPlanned}</span>
            </p>
          </div>
        ) : (
          <div id="panel-linux" role="tabpanel" aria-labelledby="tab-linux" className="install-panel install-panel-planned">
            <p className="install-planned-note">
              <LinuxIcon />
              <span>{messages.linuxPlanned}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CopyIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <rect {...iconStroke} x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path {...iconStroke} d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <polyline {...iconStroke} points="20 6 9 17 4 12" />
    </svg>
  );
}

function WindowsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M0 2.4 6.5 1.5v6H0v-5.1Zm7.4-1L16 0v7.5H7.4v-6.1ZM0 8.5h6.5v6L0 13.6V8.5Zm7.4 0H16V16l-8.6-1.2V8.5Z" />
    </svg>
  );
}

function AppleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M11.2 8.5c0-1.5 1.2-2.3 1.3-2.3-.7-1-1.8-1.2-2.2-1.2-1-.1-1.9.6-2.4.6s-1.2-.6-2-.6c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.6.8 6.1.5.7 1.1 1.5 1.9 1.5s1-.5 2-.5 1.2.5 2 .5 1.3-.7 1.8-1.4c.6-.8.8-1.6.8-1.6s-1.5-.6-1.5-2.6ZM9.7 3.9c.4-.5.7-1.2.6-1.9-.6 0-1.4.4-1.8.9-.4.5-.7 1.2-.6 1.9.7.1 1.4-.3 1.8-.9Z" />
    </svg>
  );
}

function LinuxIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path {...iconStroke} d="M9.5 4.2c0-1.2.9-2.2 2.5-2.2s2.5 1 2.5 2.2v2.6c0 1 .6 1.6 1.4 2.6 1 1.3 1.6 2.6 1.9 4.2.2 1.1.7 1.8 1.4 2.5.6.6.4 1.6-.5 1.8-1 .2-2 .5-2.6 1.1-.9.8-2.3 1.2-4.1 1.2s-3.2-.4-4.1-1.2c-.6-.6-1.6-.9-2.6-1.1-.9-.2-1.1-1.2-.5-1.8.7-.7 1.2-1.4 1.4-2.5.3-1.6.9-2.9 1.9-4.2.8-1 1.4-1.6 1.4-2.6V4.2Z" />
      <path {...iconStroke} d="M10.4 5.6h.01M13.6 5.6h.01M10.8 8.4c.7.5 1.7.5 2.4 0" />
    </svg>
  );
}
