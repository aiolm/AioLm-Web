import type { Locale } from '@/i18n/config';
import type { GuideDiagramId, GuideSlug } from '@/content/guides/types';

const iconStroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Decorative SVG art for the 3-step homepage workflow cards. */
export function WorkflowStepArt({ step }: { step: 'model' | 'runtime' | 'benchmark' }): React.JSX.Element {
  if (step === 'model') {
    return (
      <svg className="visual-art" viewBox="0 0 88 52" width="88" height="52" aria-hidden="true">
        <rect x="6" y="10" width="44" height="32" rx="6" className="visual-surface" />
        <path d="M14 21h18M14 29h26" {...iconStroke} />
        <rect x="38" y="6" width="44" height="32" rx="6" className="visual-accent-surface" />
        <circle cx="55" cy="21" r="6.5" className="visual-accent-stroke" fill="none" strokeWidth="1.7" />
        <path d="M60 26l5 5" className="visual-accent-stroke" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M67 16h8M67 22h6" className="visual-muted-stroke" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (step === 'runtime') {
    return (
      <svg className="visual-art" viewBox="0 0 88 52" width="88" height="52" aria-hidden="true">
        <rect x="6" y="8" width="76" height="36" rx="6" className="visual-surface" />
        <path d="M16 19h56M16 33h56" className="visual-muted-stroke" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="34" cy="19" r="4.5" className="visual-accent-fill" />
        <circle cx="56" cy="33" r="4.5" className="visual-accent-fill" />
        <rect x="14" y="15" width="12" height="8" rx="4" className="visual-accent-surface" />
      </svg>
    );
  }
  return (
    <svg className="visual-art" viewBox="0 0 88 52" width="88" height="52" aria-hidden="true">
      <rect x="6" y="8" width="76" height="36" rx="6" className="visual-surface" />
      <rect x="18" y="28" width="9" height="10" rx="2" className="visual-muted-fill" />
      <rect x="32" y="21" width="9" height="17" rx="2" className="visual-muted-fill" />
      <rect x="46" y="14" width="9" height="24" rx="2" className="visual-accent-fill" />
      <path d="M63 18l8-4v10" className="visual-accent-stroke" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M62 29h12" className="visual-muted-stroke" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Decorative icon for engine overview cards and guide index cards. */
export function GuideCardIcon({ slug }: { slug: GuideSlug }): React.JSX.Element {
  if (slug === 'install') {
    return (
      <svg className="guide-card-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 4v10m0 0-4-4m4 4 4-4M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" {...iconStroke} />
      </svg>
    );
  }
  if (slug === 'getting-started') {
    return (
      <svg className="guide-card-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" {...iconStroke} />
      </svg>
    );
  }
  if (slug === 'compatibility') {
    return (
      <svg className="guide-card-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5" {...iconStroke} />
        <rect x="13" y="4" width="7" height="7" rx="1.5" {...iconStroke} />
        <rect x="4" y="13" width="7" height="7" rx="1.5" {...iconStroke} />
        <path d="M13 16.5h7M16.5 13v7" {...iconStroke} />
      </svg>
    );
  }
  return (
    <svg className="guide-card-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="6.5" cy="12" r="2.5" {...iconStroke} />
      <circle cx="17.5" cy="7" r="2.5" {...iconStroke} />
      <circle cx="17.5" cy="17" r="2.5" {...iconStroke} />
      <path d="M9 11l6-3M9 13l6 3" {...iconStroke} />
    </svg>
  );
}

interface DiagramStrings {
  install: Array<{ title: string; meta: string }>;
  setup: Array<{ title: string; meta: string }>;
  memory: {
    caption: string;
    discreteTitle: string;
    discreteItems: Array<{ label: string; detail: string }>;
    sharedTitle: string;
    sharedItems: Array<{ label: string; detail: string }>;
  };
  adapter: Array<{ title: string; meta: string }>;
}

const DIAGRAM_COPY: Record<Locale, DiagramStrings> = {
  en: {
    install: [
      { title: 'Download', meta: 'Installer + checksums.txt' },
      { title: 'Verify SHA-256', meta: 'Match file hash' },
      { title: 'Install & Open', meta: 'Launch AioLM' },
    ],
    setup: [
      { title: 'Language', meta: 'Pick interface' },
      { title: 'Theme', meta: 'Light / Dark / System' },
      { title: 'Model folder', meta: 'Local library path' },
      { title: 'Engine & Chat', meta: 'Prepare & run' },
    ],
    memory: {
      caption: 'Discrete GPU keeps VRAM and System RAM separate; shared-memory devices draw from one unified RAM pool.',
      discreteTitle: 'Discrete GPU (separate pools)',
      discreteItems: [
        { label: 'GPU VRAM', detail: 'Model layers & KV cache' },
        { label: 'System RAM', detail: 'Runtime RAM + RAM Offload' },
        { label: 'Storage', detail: 'SSD Offload on overflow' },
      ],
      sharedTitle: 'Shared memory (Apple silicon / iGPU)',
      sharedItems: [
        { label: 'Unified RAM pool', detail: 'CPU & GPU share the same memory' },
        { label: 'No combined total', detail: 'Avoids counting the same RAM twice' },
      ],
    },
    adapter: [
      { title: 'Find', meta: 'Server or folder' },
      { title: 'Check', meta: 'Approve & inspect' },
      { title: 'Pick model', meta: 'Served or local' },
      { title: 'Connect', meta: 'Verify & save' },
    ],
  },
  ko: {
    install: [
      { title: '다운로드', meta: '설치 파일 + checksums.txt' },
      { title: 'SHA-256 확인', meta: '체크섬 값 비교' },
      { title: '설치 및 실행', meta: '앱 메뉴에서 열기' },
    ],
    setup: [
      { title: '언어', meta: '표시 언어 선택' },
      { title: '테마', meta: '라이트·다크·시스템' },
      { title: '모델 폴더', meta: '로컬 보관 위치' },
      { title: '엔진·대화', meta: '준비 후 실행' },
    ],
    memory: {
      caption: '외장 GPU는 VRAM과 시스템 RAM이 분리되고, 공유 메모리 기기는 하나의 통합 RAM 풀을 함께 씁니다.',
      discreteTitle: '외장 GPU (분리된 메모리)',
      discreteItems: [
        { label: 'GPU VRAM', detail: '모델 레이어·KV 캐시' },
        { label: '시스템 RAM', detail: '실행 보조 RAM + RAM 오프로드' },
        { label: '저장 장치', detail: '용량 초과 시 SSD 오프로드' },
      ],
      sharedTitle: '공유 메모리 (Apple Silicon / 내장 GPU)',
      sharedItems: [
        { label: '통합 RAM 풀', detail: 'CPU와 GPU가 같은 RAM 공유' },
        { label: '합산 생략', detail: '같은 메모리의 중복 계산 방지' },
      ],
    },
    adapter: [
      { title: '찾기', meta: '실행 서버·설치 폴더' },
      { title: '항목 확인', meta: '승인 후 검사' },
      { title: '모델 선택', meta: '서버·로컬 모델' },
      { title: '연결', meta: '응답 검증 후 저장' },
    ],
  },
  ja: {
    install: [
      { title: 'ダウンロード', meta: '導入ファイル + checksums.txt' },
      { title: 'SHA-256 照合', meta: 'チェックサム確認' },
      { title: '導入して起動', meta: 'アプリ一覧から開く' },
    ],
    setup: [
      { title: '言語', meta: '表示言語を選択' },
      { title: 'テーマ', meta: 'ライト・ダーク・自動' },
      { title: '保存先', meta: 'モデルフォルダー' },
      { title: 'エンジン・会話', meta: '準備して開始' },
    ],
    memory: {
      caption: '独立 GPU は VRAM とシステム RAM が別々で、共有メモリー環境は同一の RAM プールを共用します。',
      discreteTitle: '独立 GPU（分離プール）',
      discreteItems: [
        { label: 'GPU VRAM', detail: 'モデル層と KV キャッシュ' },
        { label: 'システム RAM', detail: '実行補助 RAM + RAM オフロード' },
        { label: 'ストレージ', detail: '超過時は SSD オフロード' },
      ],
      sharedTitle: '共有メモリー（Apple Silicon / 内蔵 GPU）',
      sharedItems: [
        { label: '統合 RAM プール', detail: 'CPU と GPU が同じメモリーを共有' },
        { label: '合計表示なし', detail: '同一 RAM の二重計上を回避' },
      ],
    },
    adapter: [
      { title: '探す', meta: 'サーバーまたはフォルダー' },
      { title: '確認', meta: '承認して検査' },
      { title: 'モデル選択', meta: '提供モデル・ローカル' },
      { title: '接続', meta: '応答検証後に保存' },
    ],
  },
  zh: {
    install: [
      { title: '下载', meta: '安装包 + checksums.txt' },
      { title: '核对 SHA-256', meta: '比对文件校验和' },
      { title: '安装并打开', meta: '从应用菜单启动' },
    ],
    setup: [
      { title: '语言', meta: '选择界面语言' },
      { title: '主题', meta: '浅色 / 深色 / 系统' },
      { title: '模型目录', meta: '本地模型文件夹' },
      { title: '引擎与聊天', meta: '准备并运行' },
    ],
    memory: {
      caption: '独立显卡区分显存与系统内存；共享内存设备共用同一块内存池，不会重复相加。',
      discreteTitle: '独立显卡（独立内存池）',
      discreteItems: [
        { label: 'GPU 显存 (VRAM)', detail: '模型层与 KV 缓存' },
        { label: '系统内存 (RAM)', detail: '运行辅助内存 + 内存卸载' },
        { label: '本地存储', detail: '超出容量时 SSD 卸载' },
      ],
      sharedTitle: '共享内存（Apple Silicon / 核显）',
      sharedItems: [
        { label: '统一内存池', detail: 'CPU 与 GPU 共用同一内存' },
        { label: '不显示总和', detail: '避免将同一内存重复计算两次' },
      ],
    },
    adapter: [
      { title: '查找', meta: '本地服务或目录' },
      { title: '检查', meta: '批准并核验' },
      { title: '选模型', meta: '服务或本地模型' },
      { title: '连接', meta: '验证通过后保存' },
    ],
  },
};

function FlowStrip({ items }: { items: Array<{ title: string; meta: string }> }): React.JSX.Element {
  return (
    <ol className="guide-flow-strip">
      {items.map((item, index) => (
        <li className="guide-flow-step" key={item.title}>
          <div className="guide-flow-head">
            <span className="guide-flow-badge" aria-hidden="true">{index + 1}</span>
            <strong className="guide-flow-title">{item.title}</strong>
          </div>
          <span className="guide-flow-meta">{item.meta}</span>
          {index < items.length - 1 ? (
            <span className="guide-flow-connector" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10m0 0-3.5-3.5M13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Visual architectural and flow diagrams embedded directly inside guide sections. */
export function GuideDiagram({ id, locale }: { id: GuideDiagramId; locale: Locale }): React.JSX.Element {
  const copy = DIAGRAM_COPY[locale];

  if (id === 'install-flow') {
    return <div className="guide-diagram"><FlowStrip items={copy.install} /></div>;
  }
  if (id === 'setup-flow') {
    return <div className="guide-diagram"><FlowStrip items={copy.setup} /></div>;
  }
  if (id === 'adapter-flow') {
    return <div className="guide-diagram"><FlowStrip items={copy.adapter} /></div>;
  }
  return (
    <figure className="guide-diagram guide-diagram-panel">
      <div className="guide-memory-grid">
        <div className="guide-memory-card">
          <h3 className="guide-memory-title">{copy.memory.discreteTitle}</h3>
          <dl className="guide-memory-list">
            {copy.memory.discreteItems.map((item) => (
              <div className="guide-memory-row" key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="guide-memory-card guide-memory-card-shared">
          <h3 className="guide-memory-title">{copy.memory.sharedTitle}</h3>
          <dl className="guide-memory-list">
            {copy.memory.sharedItems.map((item) => (
              <div className="guide-memory-row" key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <figcaption className="guide-diagram-caption">{copy.memory.caption}</figcaption>
    </figure>
  );
}
