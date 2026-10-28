import type { Locale } from '@/i18n/config';
import type { GuideContent } from './types';
const loaders = {
  en: () => import('./en'), ko: () => import('./ko'),
  ja: () => import('./ja'), zh: () => import('./zh'),
};
// Only the requested language is loaded. Guide content stays on the server.
export async function getGuides(locale: Locale): Promise<GuideContent> {
  return (await loaders[locale]()).default;
}
