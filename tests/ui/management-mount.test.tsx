import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Runs the panel's mount effects in declaration order, then again as React
// StrictMode does, without a DOM dependency.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock("@/i18n/client", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));

import { ManagementPanel } from "@/components/management-panel";

type Element = ReactElement<Record<string, unknown>>;
function nodes(value: ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function render(): Element[] {
  hooks.cursor = 0;
  hooks.effects = [];
  return nodes(ManagementPanel());
}
/** Mount: run every effect once, then StrictMode's cleanup + second run. */
function mountTwice(): void {
  render();
  const first = hooks.effects.map((effect) => effect());
  for (const cleanup of first) if (typeof cleanup === "function") cleanup();
  render();
  hooks.effects.forEach((effect) => effect());
}
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const record = { id: "record", submission_id: "00000000-0000-4000-8000-0000000000c1", public_id: "public", revision: 1, description_md: "Saved", hidden: false, expires_at: "2030-01-01T00:00:00Z" };
const id = "00000000-0000-4000-8000-0000000000d1";
const token = "B".repeat(43);

function stubPage(hash: string): { history: { replaceState: ReturnType<typeof vi.fn> }; location: { hash: string; pathname: string; search: string } } {
  const location = { hash, pathname: "/en/manage", search: "", origin: "http://localhost:3000" };
  const history = { replaceState: vi.fn(() => { location.hash = ""; }) };
  vi.stubGlobal("window", { location, history, confirm: () => true });
  return { history, location };
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effects = [];
  vi.unstubAllGlobals();
});

describe("management page mount", () => {
  it("erases the handoff fragment before any request and redeems once, never restoring over it", async () => {
    const page = stubPage(`#handoff=${id}.${token}`);
    const fetchMock = vi.fn(async (url: string) => {
      // The ticket must already be gone from the address bar when the first request starts.
      expect(page.location.hash).toBe("");
      return url.endsWith("/redeem") ? Response.json({ id: "s", csrf_token: "csrf" }) : Response.json(record);
    });
    vi.stubGlobal("fetch", fetchMock);
    mountTwice();
    await flush();
    expect(page.history.replaceState).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/v1/management-handoffs/${id}/redeem`, "/v1/management-sessions"]);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ handoff_token: token });
    const tree = render();
    expect(tree.find((e) => e.props.id === "record-title")).toBeTruthy();
    expect(tree.find((e) => e.props.id === "desc-draft")?.props.value).toBe("Saved");
  });

  it("reports a malformed or refused handoff without falling back to a cookie restore", async () => {
    stubPage(`#handoff=${id}`);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mountTwice();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(render().find((e) => e.props.role === "alert")?.props.children).toBe("manage.handoffFailed");

    hooks.values = [];
    stubPage(`#handoff=${id}.${token}`);
    const refused = vi.fn(async () => Response.json({ error: { code: "ownership_missing" } }, { status: 401 }));
    vi.stubGlobal("fetch", refused);
    mountTwice();
    await flush();
    expect(refused).toHaveBeenCalledTimes(1);
    expect(render().find((e) => e.props.role === "alert")?.props.children).toBe("manage.handoffFailed");
  });

  it("still restores an existing cookie session when there is no handoff", async () => {
    stubPage("");
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => Response.json(record));
    vi.stubGlobal("fetch", fetchMock);
    render();
    hooks.effects.forEach((effect) => effect());
    await flush();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/v1/management-sessions"]);
    const status = render().find((e) => e.props.role === "status");
    expect(nodes(status?.props.children as ReactNode).map((e) => e.props.children)).toEqual(["manage.restored"]);
  });
});
