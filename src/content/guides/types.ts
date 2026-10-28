export const guideSlugs = ['install', 'compatibility', 'adapters', 'getting-started'] as const;
export type GuideSlug = typeof guideSlugs[number];
export type GuideSection = {
  id: string;
  title: string;
  body?: string[];
  steps?: string[];
  code?: string;
  note?: string;
  table?: { headers: string[]; rows: string[][] };
  screenshot?: boolean;
};
export type Guide = { title: string; description: string; sections: GuideSection[] };
export type GuideContent = {
  title: string; description: string; navigation: string; onPage: string; related: string;
  download: string; screenshotAlt: string; screenshotCaption: string;
  guides: Record<GuideSlug, Guide>;
};
