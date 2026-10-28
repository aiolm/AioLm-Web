'use client';

import Image from 'next/image';
import { useRef } from 'react';

type Focus = { x: number; y: number; width: number; height: number };
export function GuideImageViewer({ src, caption, enlarge, close, panHint, width, height, focus }: {
  src: string; caption: string; enlarge: string; close: string; panHint: string;
  width: number; height: number; focus?: Focus | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => {
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      const scroll = dialog.current?.querySelector<HTMLElement>('.guide-image-scroll');
      const canvas = dialog.current?.querySelector<HTMLElement>('.guide-image-full');
      if (!scroll || !canvas || !focus) return;
      // Start at the highlighted control so small screens do not open on blank space.
      scroll.scrollLeft = (focus.x + focus.width / 2) / 100 * canvas.clientWidth - scroll.clientWidth / 2;
      scroll.scrollTop = (focus.y + focus.height / 2) / 100 * canvas.clientHeight - scroll.clientHeight / 2;
    });
  };
  const highlight = focus && <span className="guide-image-focus" aria-hidden="true" style={{ left: `${focus.x}%`, top: `${focus.y}%`, width: `${focus.width}%`, height: `${focus.height}%` }} />;
  return <figure className="guide-screenshot">
    <button type="button" className="guide-image-button" aria-label={`${enlarge}: ${caption}`} onClick={open}>
      <Image src={src} alt={caption} width={width} height={height} sizes="(max-width: 60rem) 100vw, 52rem" />
      {highlight}
      <span className="guide-image-enlarge">{enlarge} ↗</span>
    </button>
    <figcaption>{caption}</figcaption>
    <dialog className="guide-image-dialog" ref={dialog} aria-label={caption} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="guide-image-toolbar"><p>{caption}<span className="guide-image-pan-hint">{panHint}</span></p><button type="button" autoFocus onClick={() => dialog.current?.close()}>{close} ×</button></div>
      <div className="guide-image-scroll" tabIndex={0} aria-label={panHint}><div className="guide-image-full"><Image src={src} alt={caption} width={width} height={height} sizes="100vw" unoptimized />{highlight}</div></div>
    </dialog>
  </figure>;
}
