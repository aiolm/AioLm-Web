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

import { ManagementPanel, takeHandoffFragment } from "@/components/management-panel";
import { encodeRecoveryCode, RECOVERY_FIXTURE } from "@/lib/recovery";
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

describe("session replacement", () => {
  it("asks before a pasted code for another result replaces a dirty draft", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tree = await openManagement(fetchMock);
    invoke(find(tree, e => e.props.id === "desc-draft"), "onChange", { target: { value: "Unsaved draft" } });
    invoke(find(render(ManagementPanel), e => e.props.id === "recovery-code"), "onChange", { target: { value: encodeRecoveryCode(RECOVERY_FIXTURE) } });
    invoke(find(render(ManagementPanel), e => e.type === "form"), "onSubmit", event);
    await flush();
    expect(confirm).toHaveBeenCalledWith("manage.confirmSwitch");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(find(render(ManagementPanel), e => e.props.id === "desc-draft").props.value).toBe("Unsaved draft");
  });

  it("drops the previous record and CSRF when a newly minted session cannot be loaded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await openManagement(fetchMock);
    fetchMock.mockResolvedValueOnce(response({ id: "s2", csrf_token: "other" })).mockResolvedValueOnce(response({ error: { code: "service_unavailable" } }, 503));
    invoke(find(render(ManagementPanel), e => e.type === "form"), "onSubmit", event);
    await flush();
    const tree = render(ManagementPanel);
    expect(tree.some(e => e.props.id === "record-title")).toBe(false);
    expect(find(tree, e => e.props.role === "alert").props.children).toBe("manage.openFailed");
  });
});

describe("app handoff fragment", () => {
  const id = "00000000-0000-4000-8000-0000000000c1";
  const token = "A".repeat(43);
  const history = () => ({ replaceState: vi.fn() });

  it("reads the ticket and erases the fragment before anything else", () => {
    const h = history();
    expect(takeHandoffFragment({ hash: `#handoff=${id}.${token}`, pathname: "/ko/manage", search: "?x=1" }, h)).toEqual({ id, token });
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/ko/manage?x=1");
  });

  it("erases malformed tickets too and ignores unrelated fragments", () => {
    const h = history();
    expect(takeHandoffFragment({ hash: `#handoff=${id}`, pathname: "/en/manage", search: "" }, h)).toBe("invalid");
    expect(h.replaceState).toHaveBeenCalledWith(null, "", "/en/manage");
    const untouched = history();
    expect(takeHandoffFragment({ hash: "#record-title", pathname: "/en/manage", search: "" }, untouched)).toBeNull();
    expect(untouched.replaceState).not.toHaveBeenCalled();
  });
});

describe("recovery file picker", () => {
  const codeA = encodeRecoveryCode(RECOVERY_FIXTURE);
  const codeB = encodeRecoveryCode({ ...RECOVERY_FIXTURE, submission_id: "00000000-0000-4000-8000-000000000002" });
  const recordA = { ...record, submission_id: RECOVERY_FIXTURE.submission_id, public_id: "public-a" };
  const recordB = { ...record, submission_id: "00000000-0000-4000-8000-000000000002", public_id: "public-b", description_md: "Other" };
  const picked = (name: string, content: string) => ({ name, size: content.length, lastModified: 0, text: async () => content });
  const openButtons = (tree: Element[]): Element[] => tree.filter(e => e.type === "button" && (e.props.children === "manage.fileOpen" || e.props.children === "manage.fileRenew"));
  const storageAccess = vi.fn();
  const storage = new Proxy({}, { get: (_target, prop) => { storageAccess(prop); return () => null; } });
  let confirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    confirm = vi.fn(() => true);
    storageAccess.mockClear();
    vi.stubGlobal("window", { location: { origin: RECOVERY_FIXTURE.origin }, confirm });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
  });

  async function pick(...files: ReturnType<typeof picked>[]): Promise<{ tree: Element[]; target: { files: unknown[]; value: string } }> {
    const target = { files, value: "C:\\fakepath\\a.txt" };
    invoke(find(render(ManagementPanel), e => e.props.id === "recovery-files"), "onChange", { target });
    await flush();
    return { tree: render(ManagementPanel), target };
  }

  it("opens a picked file through the existing session POST without URLs or browser storage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { tree, target } = await pick(picked("a.txt", `${codeA}\n`), picked("b.txt", codeB), picked("junk.txt", "hello"));
    expect(target.value).toBe("");
    expect(find(tree, e => e.props.children === "manage.fileStatus.invalid")).toBeTruthy();
    expect(openButtons(tree)).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(response({ id: "s", csrf_token: "synthetic-csrf" })).mockResolvedValueOnce(response(recordA));
    invoke(openButtons(tree)[0]!, "onClick");
    await flush();
    expect(fetchMock.mock.calls[0]).toEqual(["/v1/management-sessions", expect.objectContaining({ method: "POST" })]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ recovery_code: codeA });
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain(RECOVERY_FIXTURE.secret);

    const opened = render(ManagementPanel);
    expect(openButtons(opened).map(e => e.props.children)).toEqual(["manage.fileRenew", "manage.fileOpen"]);
    expect(find(opened, e => e.type === "a" && e.props.href === "/en/benchmarks/public-a")).toBeTruthy();
    expect(button(opened, "manage.save").props.disabled).toBe(true);
    expect(storageAccess).not.toHaveBeenCalled();
  });

  it("asks before replacing a dirty draft with another result and keeps it when declined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { tree } = await pick(picked("a.txt", codeA), picked("b.txt", codeB));
    fetchMock.mockResolvedValueOnce(response({ id: "s", csrf_token: "csrf-a" })).mockResolvedValueOnce(response(recordA));
    invoke(openButtons(tree)[0]!, "onClick");
    await flush();
    invoke(find(render(ManagementPanel), e => e.props.id === "desc-draft"), "onChange", { target: { value: "Unsaved draft" } });

    confirm.mockReturnValueOnce(false);
    invoke(openButtons(render(ManagementPanel))[1]!, "onClick");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(find(render(ManagementPanel), e => e.props.id === "desc-draft").props.value).toBe("Unsaved draft");

    // Renewing the same record never asks and keeps the draft.
    fetchMock.mockResolvedValueOnce(response({ id: "s2", csrf_token: "csrf-a2" })).mockResolvedValueOnce(response(recordA));
    invoke(openButtons(render(ManagementPanel))[0]!, "onClick");
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(find(render(ManagementPanel), e => e.props.id === "desc-draft").props.value).toBe("Unsaved draft");

    fetchMock.mockResolvedValueOnce(response({ id: "s3", csrf_token: "csrf-b" })).mockResolvedValueOnce(response(recordB));
    invoke(openButtons(render(ManagementPanel))[1]!, "onClick");
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual({ recovery_code: codeB });
    expect(find(render(ManagementPanel), e => e.props.id === "desc-draft").props.value).toBe("Other");
  });

  it("marks refused and deleted results, and forgets every file when the session is cleared", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const codeC = encodeRecoveryCode({ ...RECOVERY_FIXTURE, submission_id: "00000000-0000-4000-8000-000000000003" });
    const { tree } = await pick(picked("a.txt", codeA), picked("b.txt", codeB), picked("c.txt", codeC));

    fetchMock.mockResolvedValueOnce(response({ error: { code: "ownership_missing" } }, 401));
    invoke(openButtons(tree)[0]!, "onClick");
    await flush();
    let current = render(ManagementPanel);
    expect(find(current, e => e.props.children === "manage.fileStatus.rejected")).toBeTruthy();
    expect(find(current, e => e.props.role === "alert").props.children).toBe("manage.badCode");

    fetchMock.mockResolvedValueOnce(response({ id: "s", csrf_token: "csrf" })).mockResolvedValueOnce(response({ error: { code: "not_found" } }, 404));
    invoke(openButtons(current)[0]!, "onClick");
    await flush();
    current = render(ManagementPanel);
    expect(find(current, e => e.props.children === "manage.fileStatus.gone")).toBeTruthy();
    expect(find(current, e => e.props.role === "alert").props.children).toBe("manage.alreadyDeleted");
    expect(openButtons(current)).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(response({ id: "s", csrf_token: "csrf" })).mockResolvedValueOnce(response({ ...recordA, submission_id: "00000000-0000-4000-8000-000000000003" }));
    invoke(openButtons(current)[0]!, "onClick");
    await flush();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    invoke(button(render(ManagementPanel), "manage.clear"), "onClick");
    await flush();
    current = render(ManagementPanel);
    expect(current.some(e => e.props.children === "a.txt" || e.props.children === "c.txt")).toBe(false);
    expect(openButtons(current)).toHaveLength(0);
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
