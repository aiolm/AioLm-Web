export const guideSlugs = ['install', 'getting-started', 'compatibility', 'adapters', 'external-engines'] as const;
export type GuideSlug = typeof guideSlugs[number];
export const guideImageIds = ['language', 'theme', 'folder', 'engines', 'llama-install', 'discover', 'model-files', 'model-library', 'model-settings', 'chat', 'updates', 'adapter-add', 'adapter-setup', 'adapter-help', 'adapter-check', 'adapter-review'] as const;
export type GuideImageId = typeof guideImageIds[number];
export type GuideTable = { headers: string[]; rows: string[][] };
export type GuideMore = { title: string; body: string[]; code?: string; report?: { href: string; label: string }; links?: Array<{ href: string; label: string }> };
export type GuideSection = {
  id: string;
  title: string;
  body?: string[];
  links?: Array<{ href: string; label: string }>;
  steps?: string[];
  code?: string;
  note?: string;
  table?: GuideTable;
  image?: GuideImageId;
  caption?: string;
  downloads?: 'windows' | 'macos' | 'linux';
  more?: GuideMore[];
};
export type Guide = { title: string; description: string; sections: GuideSection[] };
export type GuideContent = {
  title: string; description: string; navigation: string; onPage: string; related: string;
  download: string; screenshotNotice: string; enlarge: string; close: string; panHint: string;
  guides: Record<GuideSlug, Guide>;
};
