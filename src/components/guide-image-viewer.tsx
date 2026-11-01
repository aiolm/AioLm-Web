'use client';

import Image from 'next/image';
import { useRef } from 'react';

export function GuideImageViewer({ src, caption, enlarge, close, panHint, width, height }: {
  src: string; caption: string; enlarge: string; close: string; panHint: string;
  width: number; height: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => {
    dialog.current?.showModal();
  };
  return <figure className="guide-screenshot">
    <button type="button" className="guide-image-button" aria-label={`${enlarge}: ${caption}`} onClick={open}>
      <Image src={src} alt={caption} width={width} height={height} sizes="(max-width: 60rem) 100vw, 52rem" />
      <span className="guide-image-enlarge">{enlarge} ↗</span>
    </button>
    <figcaption>{caption}</figcaption>
    <dialog className="guide-image-dialog" ref={dialog} aria-label={caption} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="guide-image-toolbar"><p>{caption}<span className="guide-image-pan-hint">{panHint}</span></p><button type="button" autoFocus onClick={() => dialog.current?.close()}>{close} ×</button></div>
      <div className="guide-image-scroll" tabIndex={0} aria-label={panHint}><div className="guide-image-full"><Image src={src} alt={caption} width={width} height={height} sizes="100vw" unoptimized /></div></div>
    </dialog>
  </figure>;
}
