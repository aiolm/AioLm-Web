"use client";
import { useEffect, useId, useRef, useState } from "react";

interface Option { value: string; count: number }
interface Props {
  name: string; label: string; value: string; placeholder: string;
  optionsUrl: string; onChange: (value: string) => void;
  messages: { toggle: string; loading: string; empty: string; error: string; more: string };
}
/** Suggestions are optional: only an explicit selection replaces typed text. */
export function EditableCombobox({ name, label, value, placeholder, optionsUrl, onChange, messages }: Props): React.JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ url: string; options: Option[]; more: boolean; error: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = result?.url === optionsUrl ? result : null;
  const options = current?.options ?? [];
  useEffect(() => {
    if (!open || composing) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(optionsUrl, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          if (!response.ok) throw new Error("options");
          const data = await response.json();
          if (!controller.signal.aborted) setResult({ url: optionsUrl, options: data.options, more: data.has_more, error: false });
        })
        .catch(() => { if (!controller.signal.aborted) setResult({ url: optionsUrl, options: [], more: false, error: true }); });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, composing, optionsUrl]);
  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const choose = (option: Option) => { onChange(option.value); setOpen(false); setActive(-1); input.current?.focus(); };
  return <div className="explorer-field explorer-combobox" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label className="explorer-field-label" htmlFor={id}>{label}</label>
    <div className="explorer-combobox-control">
    <input ref={input} id={id} name={name} className="explorer-field-input" role="combobox" type="text" autoComplete="off"
      aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
      maxLength={120} placeholder={placeholder} value={value}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (composing || event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === "Enter") event.preventDefault(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive(index => options.length ? (index < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length) : -1);
        } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        else if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
        else if (event.key === "Tab") { setOpen(false); setActive(-1); }
      }} />
    <button type="button" className="explorer-combobox-toggle" aria-label={messages.toggle} aria-expanded={open} aria-controls={`${id}-list`}
      onMouseDown={event => event.preventDefault()}
      onClick={() => { const next = !open; input.current?.focus(); setOpen(next); setActive(-1); }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    </div>
    {open ? <div className="explorer-combobox-popup">
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="explorer-options">
        {options.map((option, index) => <li id={`${id}-${index}`} key={option.value} role="option" aria-selected={active === index}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
          <span>{option.value}</span><span className="explorer-option-count">{option.count}</span>
        </li>)}
      </ul>
      <p className="explorer-option-status" role="status">{!current ? messages.loading : current.error ? messages.error : !options.length ? messages.empty : current.more ? messages.more : null}</p>
    </div> : null}
  </div>;
}
