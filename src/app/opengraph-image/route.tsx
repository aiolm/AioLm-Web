/* eslint-disable @next/next/no-img-element -- ImageResponse renders images directly. */
import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-static';

export function GET() {
  const mark = 'data:image/png;base64,' + readFileSync(join(process.cwd(), 'public/brand/themes/13.png')).toString('base64');
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: 80, background: 'linear-gradient(158deg, #DFF3FE, #E5F1FF, #EAEFFF)', color: '#242424' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 36, marginBottom: 32 }}><img src={mark} alt="" width={48} height={48} />AioLM</div>
      <div style={{ fontSize: 76, fontWeight: 700 }}>Local models.</div>
      <div style={{ fontSize: 76, fontWeight: 700 }}>One workspace.</div>
      <div style={{ fontSize: 28, marginTop: 40, color: '#5E5E5E' }}>GGUF models · llama.cpp · Local chat · Benchmarks</div>
    </div>, { width: 1200, height: 630 },
  );
}
