import { getImageProps } from "next/image";
import type { Locale } from '@/i18n/config';
import type { Translator } from '@/i18n/types';
import screenshots from '../../public/screenshots/current/manifest.json';

/**
 * Native desktop captures of the model workspace in light and dark themes.
 * Image paths, dimensions and cache hashes come from screenshots/current/manifest.json.
 * The picture follows the operating system color scheme and downloads one
 * variant. Captures must use an isolated profile without personal user data.
 */

export function ProductScreenshot({ locale, t }: { locale: Locale; t: Translator }): React.JSX.Element {
  const lightCapture = screenshots.captures.find(capture => capture.locale === locale && capture.id === 'product-models-light');
  const darkCapture = screenshots.captures.find(capture => capture.locale === locale && capture.id === 'product-models-dark');
  if (!lightCapture || !darkCapture) throw new Error(`Missing homepage screenshots: ${locale}`);
  const common = {
    alt: t('home.screenshotAlt'),
    width: lightCapture.width,
    height: lightCapture.height,
    sizes: "(max-width: 40rem) 220vw, (min-width: 80rem) 77rem, 100vw",
    priority: true,
  };
  const { props: { srcSet: dark } } = getImageProps({
    ...common,
    src: `/screenshots/current/${darkCapture.file}?v=${darkCapture.sha256}`,
    width: darkCapture.width,
    height: darkCapture.height,
  });
  const { props: light } = getImageProps({
    ...common,
    src: `/screenshots/current/${lightCapture.file}?v=${lightCapture.sha256}`,
  });
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
