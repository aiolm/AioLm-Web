import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: 80, background: '#101827', color: '#f3f6ff' }}>
      <div style={{ fontSize: 36, color: '#84bcff', marginBottom: 32 }}>AioLM</div>
      <div style={{ fontSize: 76, fontWeight: 700 }}>Local models.</div>
      <div style={{ fontSize: 76, fontWeight: 700 }}>One workspace.</div>
      <div style={{ fontSize: 28, marginTop: 40, color: '#b7c7de' }}>GGUF models · llama.cpp · Local chat · Benchmarks</div>
    </div>, { width: 1200, height: 630 },
  );
}
