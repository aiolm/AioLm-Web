import { getImageProps } from "next/image";
import type { Translator } from '@/i18n/types';
import lightCapture from '../../public/screenshots/product-models-en-light.png';
import darkCapture from '../../public/screenshots/product-models-en-dark.png';

/**
 * A real screenshot of the desktop app's model workspace.
 *
 * The light and dark captures are one <picture> that follows the operating
 * system: the browser downloads only the one that matches. The models
 * shown are public demonstration files; the captures carry no personal paths,
 * hardware or settings.
 */
const SCREENSHOT = { width: 1440, height: 900 } as const;

export function ProductScreenshot({ t }: { t: Translator }): React.JSX.Element {
  const common = {
    alt: t('home.screenshotAlt'),
    width: SCREENSHOT.width,
    height: SCREENSHOT.height,
    sizes: "(min-width: 86rem) 80rem, (max-width: 40rem) 220vw, 100vw",
    priority: true,
  };
  // Static imports give each revised capture a content hash, so image caches
  // cannot keep showing the previous desktop design at an unchanged URL.
  const { props: { srcSet: dark } } = getImageProps({ ...common, src: darkCapture });
  const { props: light } = getImageProps({ ...common, src: lightCapture });
  return (
    <figure className="home-screenshot">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={dark} />
        <img {...light} alt={common.alt} className="home-screenshot-image" />
      </picture>
      <figcaption className="home-screenshot-caption">{t('home.caption')}</figcaption>
    </figure>
  );
}
