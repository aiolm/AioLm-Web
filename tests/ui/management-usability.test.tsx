import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Exercise the event handlers without a DOM dependency; browser coverage is separate.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
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
  useEffect: () => undefined,
}));
vi.mock("@/i18n/client", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));

import { ManagementPanel } from "@/components/management-panel";
import { VerifyPanel } from "@/components/verify-panel";
import { ReportForm } from "@/components/report-form";
import { TurnstileWidget } from "@/components/turnstile";

type Element = ReactElement<Record<string, unknown>>;
function nodes(value: ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function render(component: () => ReactNode): Element[] {
  hooks.cursor = 0;
  return nodes(component());
}
function find(tree: Element[], predicate: (element: Element) => boolean): Element {
  const match = tree.find(predicate);
  if (!match) throw new Error("Expected control was not rendered");
  return match;
}
const event = { preventDefault() {} };
const invoke = (element: Element, prop: string, value?: unknown): void => {
  (element.props[prop] as (value: unknown) => void)(value);
};
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const record = { id: "record", submission_id: "submission", public_id: "public", revision: 1, description_md: "Saved", hidden: false, expires_at: "2030-01-01T00:00:00Z" };
const response = (body: unknown, status = 200): Response => Response.json(body, { status });
const button = (tree: Element[], label: string): Element => find(tree, e => e.type === "button" && e.props.children === label);

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  vi.unstubAllGlobals();
});

async function openManagement(fetchMock: ReturnType<typeof vi.fn>): Promise<Element[]> {
  fetchMock.mockResolvedValueOnce(response({ csrf_token: "synthetic-csrf" })).mockResolvedValueOnce(response(record));
  const tree = render(ManagementPanel);
  invoke(find(tree, e => e.type === "form"), "onSubmit", event);
  await flush();
  return render(ManagementPanel);
}

describe("management draft recovery", () => {
  it("keeps a dirty draft when renewing access and when reload fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let tree = await openManagement(fetchMock);
    invoke(find(tree, e => e.props.id === "desc-draft"), "onChange", { target: { value: "Unsaved draft" } });
    tree = render(ManagementPanel);
    fetchMock.mockResolvedValueOnce(response({ csrf_token: "renewed-csrf" })).mockResolvedValueOnce(response(record));
    invoke(find(tree, e => e.type === "form"), "onSubmit", event);
    await flush();
    tree = render(ManagementPanel);
    expect(find(tree, e => e.props.id === "desc-draft").props.value).toBe("Unsaved draft");
    fetchMock.mockResolvedValueOnce(response({ error: { code: "service_unavailable" } }, 503));
    invoke(button(tree, "manage.reload"), "onClick");
    expect(button(render(ManagementPanel), "manage.reloading").props.disabled).toBe(true);
    await flush();
    expect(find(render(ManagementPanel), e => e.props.id === "desc-draft").props.value).toBe("Unsaved draft");
  });

  it("uses the acknowledged revision after a successful save whose refresh fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let tree = await openManagement(fetchMock);
    invoke(find(tree, e => e.props.id === "desc-draft"), "onChange", { target: { value: "First edit" } });
    fetchMock.mockResolvedValueOnce(response({ revision: 2 })).mockRejectedValueOnce(new Error("offline"));
    invoke(button(render(ManagementPanel), "manage.save"), "onClick");
    await flush();
    tree = render(ManagementPanel);
    expect(button(tree, "manage.save").props.disabled).toBe(true);
    invoke(find(tree, e => e.props.id === "desc-draft"), "onChange", { target: { value: "Next edit" } });
    fetchMock.mockResolvedValueOnce(response({ revision: 3 })).mockResolvedValueOnce(response({ ...record, revision: 3, description_md: "Next edit" }));
    invoke(button(render(ManagementPanel), "manage.save"), "onClick");
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual({ description_md: "Next edit", expected_revision: 2 });
  });
});

describe.each(["verify", "report"] as const)("%s challenge callbacks", (kind) => {
  it("keeps submission pending through challenge expiry and preserves success", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const component = () => kind === "verify" ? VerifyPanel({ sessionId: "synthetic" }) : ReportForm({ publicId: "synthetic" });
    let tree = render(component);
    if (kind === "report") {
      expect(tree.some(e => e.type === TurnstileWidget)).toBe(false);
      invoke(find(tree, e => e.type === "details"), "onToggle", { currentTarget: { open: true } });
      tree = render(component);
    }
    const widget = find(tree, e => e.type === TurnstileWidget);
    invoke(widget, "onVerify", "synthetic-token");
    if (kind === "report") invoke(find(tree, e => e.props.id === "report-reason"), "onChange", { target: { value: "Synthetic reason" } });
    tree = render(component);
    if (kind === "verify") invoke(button(tree, "verify.continue"), "onClick");
    else invoke(find(tree, e => e.type === "form"), "onSubmit", event);
    invoke(widget, "onExpire");
    invoke(widget, "onVerify", "replacement-token");
    tree = render(component);
    expect(button(tree, `${kind}.sending`).props.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(response({}));
    await flush();
    invoke(widget, "onExpire");
    invoke(widget, "onVerify", "late-token");
    tree = render(component);
    expect(tree.some(e => e.props.role === "status")).toBe(true);
    expect(tree.some(e => e.type === TurnstileWidget)).toBe(false);
  });
});


it("preserves report drafts and errors when the disclosure closes", async () => {
  const component = () => ReportForm({ publicId: "synthetic" });
  let tree = render(component);
  invoke(find(tree, e => e.type === "details"), "onToggle", { currentTarget: { open: true } });
  tree = render(component);
  invoke(find(tree, e => e.props.id === "report-reason"), "onChange", { target: { value: "Draft report" } });
  invoke(find(tree, e => e.type === "form"), "onSubmit", event);
  tree = render(component);
  invoke(find(tree, e => e.type === "details"), "onToggle", { currentTarget: { open: false } });
  tree = render(component);
  expect(tree.some(e => e.type === TurnstileWidget)).toBe(false);
  expect(find(tree, e => e.props.id === "report-reason").props.value).toBe("Draft report");
  expect(find(tree, e => e.props.role === "alert").props.children).toBe("report.required");
  invoke(find(tree, e => e.type === "details"), "onToggle", { currentTarget: { open: true } });
  tree = render(component);
  expect(tree.some(e => e.type === TurnstileWidget)).toBe(true);
  expect(find(tree, e => e.props.id === "report-reason").props.value).toBe("Draft report");
});
