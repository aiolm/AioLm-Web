import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Runs effects after each render when their dependencies change, and attaches
// element refs to fake nodes first, as React does, without a DOM dependency.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  pending: [] as Array<() => void>,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.values[index] as [unknown, unknown[]] | undefined;
    if (previous && deps.every((dep, i) => Object.is(dep, previous[1][i]))) return previous[0];
    hooks.values[index] = [callback, deps];
    return callback;
  },
  useEffect: (effect: () => void, deps?: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.values[index] as unknown[] | undefined;
    if (previous && deps && deps.every((dep, i) => Object.is(dep, previous[i]))) return;
    hooks.values[index] = deps;
    hooks.pending.push(effect);
  },
}));
vi.mock("@/i18n/client", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));

import { ManagementPanel } from "@/components/management-panel";
import { VerifyPanel } from "@/components/verify-panel";
import { ReportForm } from "@/components/report-form";
import { TurnstileWidget } from "@/components/turnstile";

type Element = ReactElement<Record<string, unknown>>;
type FakeNode = { name: string; focus: ReturnType<typeof vi.fn>; isConnected: boolean; disabled: boolean; matches(selector: string): boolean };

function nodes(value: ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}

const fakes = new Map<string, FakeNode>();
const attached = new Set<{ current: unknown }>();
function fake(name: string): FakeNode {
  if (!fakes.has(name)) {
    const node: FakeNode = { name, focus: vi.fn(() => { doc.activeElement = node; }), isConnected: true, disabled: false, matches: (s) => s === ":disabled" && node.disabled };
    fakes.set(name, node);
  }
  return fakes.get(name)!;
}
const doc = { body: { name: "body" } as unknown, activeElement: null as unknown };

/** Render, attach refs (rendered elements get fakes, unmounted ones null), then run due effects. */
function render(component: () => ReactNode, nameOf: (element: Element) => string): Element[] {
  hooks.cursor = 0;
  hooks.pending = [];
  const tree = nodes(component());
  const seen = new Set<{ current: unknown }>();
  for (const element of tree) {
    const ref = element.props.ref as { current: unknown } | undefined;
    if (!ref || typeof ref !== "object") continue;
    const node = fake(nameOf(element));
    node.isConnected = true;
    node.disabled = element.props.disabled === true;
    ref.current = node;
    seen.add(ref);
    attached.add(ref);
  }
  for (const ref of attached) {
    if (seen.has(ref)) continue;
    const node = ref.current as FakeNode | null;
    if (node) node.isConnected = false;
    ref.current = null;
  }
  for (const effect of hooks.pending) effect();
  return tree;
}
function find(tree: Element[], predicate: (element: Element) => boolean): Element {
  const match = tree.find(predicate);
  if (!match) throw new Error("Expected element was not rendered");
  return match;
}
const invoke = (element: Element, prop: string, value?: unknown): void => {
  (element.props[prop] as (value: unknown) => void)(value);
};
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const response = (body: unknown, status = 200): Response => Response.json(body, { status });
const event = { preventDefault() {} };
const record = { id: "record", submission_id: "submission", public_id: "public", revision: 1, description_md: "Saved", hidden: false, expires_at: "2030-01-01T00:00:00Z" };
const nameById = (element: Element): string => String(element.props.id ?? element.props.className ?? element.type);

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  fakes.clear();
  attached.clear();
  doc.activeElement = doc.body;
  vi.unstubAllGlobals();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    location: { hash: "", pathname: "/en/manage", search: "", origin: "https://example.test" },
    history: { replaceState: vi.fn() },
    confirm: vi.fn(() => true),
  });
});

describe("management panel", () => {
  const panel = (): Element[] => render(ManagementPanel, nameById);
  const button = (tree: Element[], label: string): Element => find(tree, e => e.type === "button" && e.props.children === label);

  async function open(fetchMock: ReturnType<typeof vi.fn>, after: Response = response(record)): Promise<Element[]> {
    fetchMock.mockResolvedValueOnce(response({ id: "s", csrf_token: "synthetic-csrf" })).mockResolvedValueOnce(after);
    const tree = panel();
    invoke(find(tree, e => e.props.id === "recovery-code"), "onChange", { target: { value: "synthetic-code" } });
    doc.activeElement = fake("primary");
    invoke(find(panel(), e => e.type === "form"), "onSubmit", event);
    // The submit button is disabled while opening; the browser moves focus to the page.
    expect(find(panel(), e => e.type === "button" && e.props.type === "submit").props.disabled).toBe(true);
    doc.activeElement = doc.body;
    await flush();
    return panel();
  }

  it("keeps one status region mounted and announces info inside it, errors as alerts", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    let tree = panel();
    const region = find(tree, e => e.props.role === "status" && e.type === "div");
    expect(nodes(region.props.children as ReactNode)).toHaveLength(0);
    await flush();
    tree = await open(fetchMock);
    const status = find(tree, e => e.props.role === "status" && e.type === "div");
    expect(nodes(status.props.children as ReactNode).map(e => e.props.children)).toEqual(["manage.opened"]);
    expect(tree.some(e => e.props.role === "alert")).toBe(false);
  });

  it("marks a refused pasted code invalid, points it at the error, and clears that on edit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    panel();
    await flush();
    fetchMock.mockResolvedValueOnce(response({ error: { code: "ownership_missing" } }, 401));
    invoke(find(panel(), e => e.props.id === "recovery-code"), "onChange", { target: { value: "wrong-code" } });
    invoke(find(panel(), e => e.type === "form"), "onSubmit", event);
    await flush();
    let tree = panel();
    const code = find(tree, e => e.props.id === "recovery-code");
    expect(code.props["aria-invalid"]).toBe(true);
    expect(code.props["aria-describedby"]).toBe("recovery-hint manage-message");
    expect(find(tree, e => e.props.id === "manage-message")).toMatchObject({ props: { role: "alert", children: "manage.badCode" } });
    invoke(code, "onChange", { target: { value: "fixed-code" } });
    tree = panel();
    expect(find(tree, e => e.props.id === "recovery-code").props["aria-invalid"]).toBe(false);
    expect(find(tree, e => e.props.id === "recovery-code").props["aria-describedby"]).toBe("recovery-hint");
  });

  it("returns focus to the control that was disabled during an operation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    panel();
    await flush();
    await open(fetchMock);
    expect(fake("primary").focus).toHaveBeenCalledTimes(1);

    // Reload stays available afterwards, so focus goes back to it.
    fetchMock.mockResolvedValueOnce(response(record));
    doc.activeElement = fake("reload");
    invoke(button(panel(), "manage.reload"), "onClick");
    panel();
    doc.activeElement = doc.body;
    await flush();
    panel();
    expect(fake("reload").focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the record heading when save leaves its button disabled, and to the page heading after delete", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    panel();
    await flush();
    await open(fetchMock);
    invoke(find(panel(), e => e.props.id === "desc-draft"), "onChange", { target: { value: "Edited" } });

    const save = fake("save");
    fetchMock.mockResolvedValueOnce(response({ revision: 2 })).mockResolvedValueOnce(response({ ...record, revision: 2, description_md: "Edited" }));
    doc.activeElement = save;
    invoke(button(panel(), "manage.save"), "onClick");
    panel();
    save.disabled = true;
    doc.activeElement = doc.body;
    await flush();
    panel();
    expect(save.focus).not.toHaveBeenCalled();
    expect(fake("record-title").focus).toHaveBeenCalledTimes(1);

    const remove = fake("delete");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    doc.activeElement = remove;
    invoke(button(panel(), "manage.delete"), "onClick");
    panel();
    remove.isConnected = false;
    doc.activeElement = doc.body;
    await flush();
    const tree = panel();
    expect(tree.some(e => e.props.id === "record-title")).toBe(false);
    expect(find(tree, e => e.props.id === "manage-title").props.tabIndex).toBe(-1);
    expect(fake("manage-title").focus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus alone when the user already moved it elsewhere", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: { code: "unauthorized" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    panel();
    await flush();
    await open(fetchMock);
    fetchMock.mockResolvedValueOnce(response(record));
    doc.activeElement = fake("reload");
    invoke(button(panel(), "manage.reload"), "onClick");
    panel();
    doc.activeElement = fake("elsewhere");
    await flush();
    panel();
    expect(fake("reload").focus).not.toHaveBeenCalled();
  });

  it("describes the draft with its count without announcing every keystroke, and with the read-only note when it cannot be saved", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(record));
    vi.stubGlobal("fetch", fetchMock);
    panel();
    await flush();
    const tree = panel();
    const draft = find(tree, e => e.props.id === "desc-draft");
    expect(draft.props["aria-describedby"]).toBe("desc-count desc-read-only");
    expect(find(tree, e => e.props.id === "desc-read-only").props.children).toBe("manage.readOnly");
    expect(find(tree, e => e.props.id === "desc-count").props["aria-live"]).toBeUndefined();
  });
});

describe.each(["verify", "report"] as const)("%s focus after sending", (kind) => {
  const component = () => kind === "verify" ? VerifyPanel({ sessionId: "synthetic" }) : ReportForm({ publicId: "synthetic" });
  const nameOf = (element: Element): string => element.type === "button" ? "button" : "message";
  const view = (): Element[] => render(component, nameOf);

  async function send(result: Response): Promise<Element[]> {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(result));
    let tree = view();
    if (kind === "report") {
      invoke(find(tree, e => e.type === "details"), "onToggle", { currentTarget: { open: true } });
      tree = view();
      invoke(find(tree, e => e.props.id === "report-reason"), "onChange", { target: { value: "Synthetic reason" } });
    }
    invoke(find(tree, e => e.type === TurnstileWidget), "onVerify", "synthetic-token");
    tree = view();
    doc.activeElement = fake("button");
    if (kind === "verify") invoke(find(tree, e => e.type === "button"), "onClick");
    else invoke(find(tree, e => e.type === "form"), "onSubmit", event);
    expect(find(view(), e => e.type === "button").props.disabled).toBe(true);
    doc.activeElement = doc.body;
    await flush();
    return view();
  }

  it("gives focus back to the button after a failure", async () => {
    const tree = await send(response({ error: { code: "service_unavailable" } }, 503));
    expect(find(tree, e => e.props.role === "alert")).toBeTruthy();
    expect(fake("button").focus).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the confirmation once sending succeeds", async () => {
    const tree = await send(response({}));
    const status = find(tree, e => e.props.role === "status");
    expect(status.props.tabIndex).toBe(-1);
    expect(fake("message").focus).toHaveBeenCalledTimes(1);
    expect(fake("button").focus).not.toHaveBeenCalled();
  });
});
