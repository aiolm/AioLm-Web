import { DESKTOP_RELEASE_VERSION } from '@/lib/desktop-release';
import { GITHUB_REPOSITORY_URL } from './site-links';

export type InstallOs = 'windows' | 'macos' | 'linux';

const files = {
  windows: [{ label: 'Windows x64', suffix: 'x64-setup.exe' }],
  macos: [{ label: 'Mac · Apple Silicon (M1, M2, …)', suffix: 'aarch64.dmg' }, { label: 'Mac · Intel', suffix: 'x64.dmg' }],
  linux: [{ label: 'Linux · DEB', suffix: 'amd64.deb' }, { label: 'Linux · AppImage', suffix: 'amd64.AppImage' }],
} as const;

export function InstallerDownloads({ os }: { os: InstallOs }) {
  return <div className="guide-download-choices">{files[os].map(({ label, suffix }) => {
    const file = `AioLM_${DESKTOP_RELEASE_VERSION}_${suffix}`;
    return <a key={file} href={`${GITHUB_REPOSITORY_URL}/releases/download/v${DESKTOP_RELEASE_VERSION}/${file}`}><span>{label} ↓</span><small>{file}</small></a>;
  })}</div>;
}
