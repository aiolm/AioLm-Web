import type { Locale } from '@/i18n/config';
import type { MessageCatalog } from '@/i18n/types';
import { localizedPath } from '@/i18n/config';
import { createTranslator } from '@/i18n/translate';
import { InstallCommand } from './install-command';

export { InstallSecurityWarning } from './install-security-warning';

/** Share the published installer commands between the homepage and install guide. */
export function InstallSection({ locale, messages, showDownloads = true }: { showDownloads?: boolean; locale: Locale; messages: MessageCatalog }) {
  const t = createTranslator(messages);
  return <InstallCommand
    locale={locale}
    showDownloads={showDownloads}
    macosGuideUrl={localizedPath(locale, '/guides/install#macos')}
    linuxGuideUrl={localizedPath(locale, '/guides/install#linux')}
    messages={{
      windows: t('home.windows'),
      macos: t('home.macos'),
      linux: t('home.linux'),
      title: t('home.installCommandTitle'),
      copy: t('home.copyCommand'),
      copied: t('home.copied'),
      copyFailed: t('home.copyFailed'),
      download: t('home.download'),
      windowsRequirements: t('home.windowsRequirements'),
      windowsInstructions: t('home.windowsInstructions'),
      windowsWarning: t('home.windowsWarning'),
      macosRequirements: t('home.macosRequirements'),
      macosInstructions: t('home.macosInstructions'),
      macosWarning: t('home.macosWarning'),
      macosGuide: t('home.macosGuide'),
      linuxRequirements: t('home.linuxRequirements'),
      linuxInstructions: t('home.linuxInstructions'),
      linuxGuide: t('home.linuxGuide'),
    }}
  />;
}
