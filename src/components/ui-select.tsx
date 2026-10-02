"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ui-controls.css";

export interface UiSelectOption { value: string; label: string; lang?: string; disabled?: boolean }
interface Props {
  id?: string; name?: string; form?: string; value: string; options: UiSelectOption[];
  onChange: (value: string) => void; disabled?: boolean; className?: string;
  /** The visible label's id; also names the popup listbox. */
  labelledBy?: string; describedBy?: string;
}
export interface SelectKeyState { open: boolean; highlighted: number; selected: number; typeahead: string }
export type SelectKeyAction =
  | { type: "none" }
  | { type: "open"; highlighted: number }
  | { type: "close"; handled: boolean }
  | { type: "highlight"; index: number; typeahead?: string }
  | { type: "commit"; index: number; typeahead?: string };

/** Next enabled option at or after `from`, wrapping in the direction of `step`. */
function enabledFrom(options: UiSelectOption[], from: number, step: 1 | -1, match: (option: UiSelectOption) => boolean = () => true): number {
  for (let offset = 0; offset < options.length; offset += 1) {
    const index = ((from + step * offset) % options.length + options.length) % options.length;
    if (!options[index].disabled && match(options[index])) return index;
  }
  return -1;
}
/** Opening seeds the highlight at the committed value, or the nearest enabled option. */
export function initialHighlight(options: UiSelectOption[], selected: number): number {
  return enabledFrom(options, Math.max(selected, 0), 1);
}

/**
 * Keyboard behavior of a select-only combobox, kept pure so it can be tested
 * without a DOM. It mirrors the desktop app's CustomSelect: arrows and Home/End
 * move over enabled options, typing jumps by label prefix (committing directly
 * while closed, like a native select), Enter and Space commit, Escape and Tab
 * close. Enter is always consumed so a surrounding form is never submitted.
 */
export function selectKeyAction(key: string, state: SelectKeyState, options: UiSelectOption[], modifiers = false): SelectKeyAction {
  const { open, highlighted, selected, typeahead } = state;
  if (key === "Escape") return open ? { type: "close", handled: true } : { type: "none" };
  if (key === "Tab") return open ? { type: "close", handled: false } : { type: "none" };
  if (key.length === 1 && key !== " " && !modifiers) {
    const query = (typeahead + key).toLocaleLowerCase();
    const matches = (option: UiSelectOption) => option.label.toLocaleLowerCase().startsWith(query);
    let index = enabledFrom(options, (open ? highlighted : selected) + 1, 1, matches);
    // A longer prefix may only match the current option, so retry from the start.
    if (index === -1 && query.length > 1) index = enabledFrom(options, 0, 1, matches);
    if (index === -1) return { type: "highlight", index: open ? highlighted : -1, typeahead: query };
    return open ? { type: "highlight", index, typeahead: query } : { type: "commit", index, typeahead: query };
  }
  if (!open) {
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") return { type: "open", highlighted: initialHighlight(options, selected) };
    if (key === "Home") return { type: "open", highlighted: enabledFrom(options, 0, 1) };
    if (key === "End") return { type: "open", highlighted: enabledFrom(options, options.length - 1, -1) };
    return { type: "none" };
  }
  if (key === "ArrowDown") return { type: "highlight", index: highlighted < 0 ? enabledFrom(options, 0, 1) : enabledFrom(options, highlighted + 1, 1) };
  if (key === "ArrowUp") return { type: "highlight", index: highlighted < 0 ? enabledFrom(options, options.length - 1, -1) : enabledFrom(options, highlighted - 1, -1) };
  if (key === "Home") return { type: "highlight", index: enabledFrom(options, 0, 1) };
  if (key === "End") return { type: "highlight", index: enabledFrom(options, options.length - 1, -1) };
  if (key === "Enter" || key === " ") return { type: "commit", index: highlighted };
  return { type: "none" };
}

/** The value a commit changes to, or null: disabled options and re-choosing the current value are not changes, like a native select. */
export function committedValue(options: UiSelectOption[], index: number, current: string): string | null {
  const option = options[index];
  return option && !option.disabled && option.value !== current ? option.value : null;
}

interface MenuPosition { top: number; left: number; minWidth: number; maxHeight: number; above: boolean }

/** A fixed-choice dropdown matching the app: a button trigger, a portal listbox and a hidden form value. */
export function UiSelect({ id, name, form, value, options, onChange, disabled = false, className = "", labelledBy, describedBy }: Props): React.JSX.Element {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ query: string; timer: ReturnType<typeof setTimeout> | null }>({ query: "", timer: null });
  const open = isOpen && !disabled;
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    const buffer = typeahead.current;
    return () => { if (buffer.timer) clearTimeout(buffer.timer); };
  }, []);
  // Clicking the visible label focuses the trigger without also toggling the menu.
  useLayoutEffect(() => {
    const button = trigger.current;
    if (!button) return;
    const labels = Array.from(button.labels ?? []);
    const focus = (event: MouseEvent) => {
      if (event.target instanceof Node && button.contains(event.target)) return;
      event.preventDefault();
      if (!button.disabled) button.focus();
    };
    labels.forEach(label => label.addEventListener("click", focus));
    return () => labels.forEach(label => label.removeEventListener("click", focus));
  });
  const place = useCallback(() => {
    const button = trigger.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const edge = 8, gap = 4;
    const below = Math.max(0, window.innerHeight - rect.bottom - edge - gap);
    const aboveSpace = Math.max(0, rect.top - edge - gap);
    const above = below < 160 && aboveSpace > below;
    const minWidth = Math.min(Math.max(rect.width, 160), window.innerWidth - edge * 2);
    // The menu grows to its longest label; once mounted, its measured width keeps it inside the viewport.
    const width = Math.max(minWidth, menu.current?.offsetWidth ?? 0);
    const next = {
      top: above ? rect.top - gap : rect.bottom + gap,
      left: Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - edge - width)),
      minWidth, maxHeight: Math.max(64, Math.min(280, above ? aboveSpace : below)), above,
    };
    setPosition(previous => previous && (Object.keys(next) as (keyof MenuPosition)[]).every(key => previous[key] === next[key]) ? previous : next);
  }, []);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !menu.current?.contains(target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const mounted = position !== null;
  useLayoutEffect(() => { if (open && mounted) place(); }, [open, mounted, place]);
  useLayoutEffect(() => {
    if (open && position && highlighted >= 0) menu.current?.children[highlighted]?.scrollIntoView?.({ block: "nearest" });
  }, [open, position, highlighted]);

  const openMenu = (index: number) => { setHighlighted(index); setIsOpen(true); };
  const commit = (index: number) => {
    const next = committedValue(options, index, value);
    setIsOpen(false);
    if (next !== null) onChange(next);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || event.nativeEvent.isComposing) return;
    const action = selectKeyAction(event.key, { open, highlighted, selected: selectedIndex, typeahead: typeahead.current.query }, options, event.ctrlKey || event.metaKey || event.altKey);
    if (action.type === "none") return;
    if (action.type !== "close" || action.handled) event.preventDefault();
    if (action.type === "close" && action.handled) event.stopPropagation();
    if ((action.type === "highlight" || action.type === "commit") && action.typeahead !== undefined) {
      const buffer = typeahead.current;
      if (buffer.timer) clearTimeout(buffer.timer);
      buffer.query = action.typeahead;
      buffer.timer = setTimeout(() => { buffer.query = ""; }, 700);
    }
    if (action.type === "open") openMenu(action.highlighted);
    else if (action.type === "close") setIsOpen(false);
    else if (action.type === "highlight") { if (action.index >= 0) setHighlighted(action.index); }
    else commit(action.index);
  };

  return <div ref={container} className={`ui-select ${className}`.trim()}
    onBlur={event => { if (!container.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setIsOpen(false); }}>
    {name ? <input type="hidden" name={name} form={form} value={value} disabled={disabled} /> : null}
    <button ref={trigger} id={id} type="button" className="ui-select-trigger" role="combobox" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open && mounted ? listboxId : undefined} aria-labelledby={labelledBy} aria-describedby={describedBy}
      aria-activedescendant={open && mounted && options[highlighted] ? `${listboxId}-${highlighted}` : undefined} disabled={disabled}
      onClick={() => { if (open) setIsOpen(false); else openMenu(initialHighlight(options, selectedIndex)); }} onKeyDown={onKeyDown}>
      <span className="ui-select-value" lang={selected?.lang}>{selected?.label ?? value}</span>
      <svg className="ui-select-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && position ? createPortal(<ul ref={menu} id={listboxId} role="listbox" aria-labelledby={labelledBy}
      className={`ui-menu${position.above ? " ui-menu--above" : ""}`}
      style={{ top: position.top, left: position.left, minWidth: position.minWidth, maxHeight: position.maxHeight }}>
      {options.map((option, index) => <li key={option.value} id={`${listboxId}-${index}`} role="option" lang={option.lang}
        aria-selected={index === selectedIndex} aria-disabled={option.disabled || undefined}
        className={`ui-option${index === highlighted ? " is-highlighted" : ""}`}
        onMouseDown={event => event.preventDefault()}
        onMouseMove={() => { if (!option.disabled && index !== highlighted) setHighlighted(index); }}
        onClick={() => { if (option.disabled) return; commit(index); trigger.current?.focus(); }}>
        <span className="ui-option-label">{option.label}</span>
        {index === selectedIndex ? <svg className="ui-option-check" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
      </li>)}
    </ul>, document.body) : null}
  </div>;
}
