import type { Locale } from '@/i18n/config';

const titles: Record<Locale, string> = {
  en: 'Installation security warning',
  ko: '설치 시 보안 경고 안내',
  ja: 'インストール時のセキュリティ警告',
  zh: '安装时的安全警告',
};

export function InstallSecurityWarning({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <aside className="install-security-warning" role="note">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <path d="m12 3 10 18H2L12 3Z" strokeLinejoin="round" />
      <path d="M12 9v5m0 3v.1" strokeLinecap="round" />
    </svg>
    <div className="install-security-copy"><strong>{titles[locale]}</strong><p>{children}</p></div>
  </aside>;
}
