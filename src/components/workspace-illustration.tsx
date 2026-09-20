/**
 * A code-native picture of the desktop app beside the hero.
 *
 * It is deliberately not a screenshot and not a mock of live data: there are no
 * model names, no search controls, no numbers and nothing interactive. It shows
 * what the workspace is for, so nothing here can go stale or read as a real
 * published result. The window chrome is decorative; the capability list is real
 * content and stays in the accessibility tree.
 */

const NAV_ITEMS = ["Models", "Runtimes", "Chat", "Benchmarks"] as const;

const CAPABILITIES = [
  { icon: <CubeIcon />, title: "GGUF model library", detail: "Find and organize local models" },
  { icon: <GearIcon />, title: "Runtime management", detail: "Choose a llama.cpp backend" },
  { icon: <ChatIcon />, title: "Local conversations", detail: "Chat with your models" },
  { icon: <ChartIcon />, title: "Performance benchmarks", detail: "Measure and review your setup" },
] as const;

export function WorkspaceIllustration(): React.JSX.Element {
  return (
    <figure className="workspace-figure">
      <div className="workspace-window">
        <div className="workspace-titlebar" aria-hidden="true">
          <span className="workspace-titlebar-brand">
            <span className="workspace-titlebar-mark" />
            AioLM
          </span>
          <span className="workspace-titlebar-controls">
            <i /><i /><i />
          </span>
        </div>

        <div className="workspace-body">
          <div className="workspace-sidebar" aria-hidden="true">
            {NAV_ITEMS.map((item, index) => (
              <span
                key={item}
                className={index === 0 ? "workspace-nav-item is-current" : "workspace-nav-item"}
              >
                {item}
              </span>
            ))}
          </div>

          <div className="workspace-content">
            <p className="workspace-content-title">Workspace overview</p>
            <ul className="workspace-capabilities">
              {CAPABILITIES.map((capability) => (
                <li className="workspace-capability" key={capability.title}>
                  <span className="workspace-capability-icon" aria-hidden="true">{capability.icon}</span>
                  <span className="workspace-capability-copy">
                    <span className="workspace-capability-title">{capability.title}</span>
                    <span className="workspace-capability-detail">{capability.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        The AioLM desktop workspace groups a GGUF model library, llama.cpp runtime management, local
        conversations and performance benchmarks in one window.
      </figcaption>
    </figure>
  );
}

/* Icons: 20px line art on the current text color, matching the app's nav icons. */
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CubeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path {...strokeProps} d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path {...strokeProps} d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle {...strokeProps} cx="12" cy="12" r="3.2" />
      <path
        {...strokeProps}
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"
      />
    </svg>
  );
}

function ChatIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path {...strokeProps} d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8Z" />
    </svg>
  );
}

function ChartIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path {...strokeProps} d="M4 20h16" />
      <path {...strokeProps} d="M7 20v-6M12 20V6M17 20v-9" />
    </svg>
  );
}
