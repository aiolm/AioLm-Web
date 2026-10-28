'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';

type Section = { id: string; title: string };

export function GuideTableOfContents({ label, sections }: { label: string; sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const mobile = useRef<HTMLDetailsElement>(null);
  const focusFrame = useRef<number | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const firstSection = sections[0] && document.getElementById(sections[0].id);
      const padding = parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingBlockStart) || 0;
      const margin = firstSection ? parseFloat(window.getComputedStyle(firstSection).scrollMarginBlockStart) || 0 : 0;
      const cutoff = Math.max(120, padding + margin + 8, Math.min(180, window.innerHeight * .18));
      let next = sections[0]?.id ?? '';
      for (const section of sections) {
        const heading = document.getElementById(`title-${section.id}`);
        if (!heading) continue;
        if (heading.getBoundingClientRect().top > cutoff) break;
        next = section.id;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        next = sections.at(-1)?.id ?? next;
      }
      setActiveId(current => current === next ? current : next);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('hashchange', schedule);
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
    };
  }, [sections]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setActiveId(id);
    if (mobile.current) mobile.current.open = false;
    if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
    focusFrame.current = window.requestAnimationFrame(() => {
      focusFrame.current = null;
      document.getElementById(`title-${id}`)?.focus({ preventScroll: true });
    });
  };

  const links = sections.map(section => <li key={section.id}>
    <a href={`#${section.id}`} aria-current={activeId === section.id ? 'location' : undefined}
      onClick={event => navigate(event, section.id)}>{section.title}</a>
  </li>);

  return <div className="guide-toc-region">
    <nav className="guide-toc guide-toc--desktop" aria-label={label}>
      <p className="guide-toc-label">{label}</p>
      <ul className="guide-toc-links">{links}</ul>
    </nav>
    <details className="guide-toc-mobile" ref={mobile}>
      <summary>{label}<svg className="guide-toc-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg></summary>
      <nav className="guide-toc guide-toc--mobile" aria-label={label}>
        <ul className="guide-toc-links">{links}</ul>
      </nav>
    </details>
  </div>;
}
