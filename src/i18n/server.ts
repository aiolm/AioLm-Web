import 'server-only';
import type { Locale } from './config';
import type { MessageCatalog } from './types';
const loaders = {
  site: {
    en: () => import('./messages/site/en'),
    ko: () => import('./messages/site/ko'),
    ja: () => import('./messages/site/ja'),
    zh: () => import('./messages/site/zh'),
  },
  home: {
    en: () => import('./messages/home/en'),
    ko: () => import('./messages/home/ko'),
    ja: () => import('./messages/home/ja'),
    zh: () => import('./messages/home/zh'),
  },
  common: {
    en: () => import('./messages/common/en'),
    ko: () => import('./messages/common/ko'),
    ja: () => import('./messages/common/ja'),
    zh: () => import('./messages/common/zh'),
  },
  benchmark: {
    en: () => import('./messages/benchmark/en'),
    ko: () => import('./messages/benchmark/ko'),
    ja: () => import('./messages/benchmark/ja'),
    zh: () => import('./messages/benchmark/zh'),
  },
  management: {
    en: () => import('./messages/management/en'),
    ko: () => import('./messages/management/ko'),
    ja: () => import('./messages/management/ja'),
    zh: () => import('./messages/management/zh'),
  },
};
export async function getMessages(locale: Locale, namespace: keyof typeof loaders): Promise<MessageCatalog> {
  return (await loaders[namespace][locale]()).default;
}
