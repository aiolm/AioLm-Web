import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18n } from '@/i18n/client';
import { LanguageSelector } from '@/components/language-selector';
import site from '@/i18n/messages/site/en';
function Probe() { const { locale, t } = useI18n(); return <p>{locale}|{t('parent')}|{t('child')}|{t('override')}</p>; }
describe('locale provider', () => {
  it('merges feature messages while preserving the selected root locale', () => {
    const html = renderToStaticMarkup(<I18nProvider locale="ko" messages={{ parent: 'shared', override: 'old' }}><I18nProvider locale="en" messages={{ child: 'feature', override: 'new' }}><Probe /></I18nProvider></I18nProvider>);
    expect(html).toBe('<p>ko|shared|feature|new</p>');
  });
  it('renders a labeled language combobox with the selected language and navigation notice', () => {
    const html = renderToStaticMarkup(<I18nProvider locale="ja" messages={site}><LanguageSelector /></I18nProvider>);
    expect(html).toContain('type="hidden" name="locale" value="ja"');
    expect(html).toMatch(/role="combobox" aria-haspopup="listbox" aria-expanded="false"[^>]*aria-labelledby="[^"]+-label" aria-describedby="[^"]+-hint"/);
    expect(html).toContain('<span class="ui-select-value" lang="ja">日本語</span>');
    expect(html).toContain('Language');
    expect(html).toContain('Changing language');
  });
});
