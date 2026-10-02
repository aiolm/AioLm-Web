import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Both products consume the same checked colors. Keep app geometry and native
// interaction tokens in place while copying generated surface treatments.
export function syncAppTheme(appRoot) {
  const appStyles = path.resolve(appRoot, 'src/styles');
  const palettePath = path.join(appStyles, 'app-palette.css');
  const tokenPath = path.join(appStyles, 'app-tokens.css');
  if (!fs.existsSync(palettePath) || !fs.existsSync(tokenPath)) throw new Error('Expected existing AioLM style files');
  const readTheme = name => fs.readFileSync(new URL('../src/theme/' + name, import.meta.url), 'utf8');
  const tones = JSON.parse(readTheme('status-tones.json'));
  const controls = JSON.parse(readTheme('control-tones.json'));
  const design = JSON.parse(readTheme('palette-data.json'))[0];
  const shared = [...readTheme('palettes.css').matchAll(/:root \{\n([\s\S]*?)\n\}/g)]
    .map(match => match[1]).filter(body => body.includes('--ui-bg:'))
    .map(body => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]])));
  if (shared.length !== 2) throw new Error('Expected light and dark generated colors');
  const middle = stops => stops[Math.floor(stops.length / 2)];
  const blockPattern = /(^:root(?:, :root\[data-theme="light"\]|\[data-theme="dark"\])? \{\n)([\s\S]*?)(\n\})/gm;
  let blocks = 0;
  const palette = fs.readFileSync(palettePath, 'utf8').replace(/\r\n/g, '\n').replace(blockPattern, (match, header, body, end) => {
    const mode = header.includes('dark') ? 'dark' : 'light';
    const web = shared[mode === 'dark' ? 1 : 0];
    const values = {};
    for (const [role, tone] of Object.entries(tones[mode])) {
      for (const suffix of ['bg', 'ink', 'gradient']) values[`tone-${role}-${suffix}`] = web[`tone-${role}-${suffix}`];
      if (tone.action) {
        for (const suffix of ['gradient', 'hover', 'ink']) values[`tone-${role}-action-${suffix}`] = web[`tone-${role}-action-${suffix}`];
        values[`tone-${role}-action-fill`] = middle(tone.action.stops);
        values[`tone-${role}-action-fill-hover`] = middle(tone.action.hoverStops);
      }
    }
    values['ui-danger-hover'] = tones[mode].error.action.hoverStops[0];
    if (body.includes('--ui-bg:')) {
      for (const name of ['ui-field-rest-gradient', 'ui-field-hover-gradient', 'ui-mono-gradient', 'ui-action-secondary-gradient', 'ui-action-secondary-gradient-hover', 'ui-soft-gradient', 'ui-selected-gradient', 'ui-secondary-gradient', 'ui-rail-gradient', 'ui-field-gradient', 'ui-device-gradient', 'ui-canvas-gradient', 'ui-action-gradient', 'ui-on-accent', 'ui-accent-solid', 'ui-accent-solid-hover', 'ui-accent-solid-active']) values[name] = web[name];
      values['ui-primary-gradient'] = web['ui-action-gradient'];
      for (const [name, value] of Object.entries(values)) {
        if (!value) throw new Error('Missing generated ' + mode + ' ' + name);
        if (!body.includes(`--${name}:`)) body += `\n --${name}: ${value};`;
      }
    }
    blocks++;
    return header + body.replace(/--([\w-]+):\s*([^;]+);/g, (declaration, name) => name in values ? `--${name}: ${values[name]};` : declaration) + end;
  });
  if (blocks !== 4) throw new Error('Unexpected app palette block count: ' + blocks);
  const tokens = fs.readFileSync(tokenPath, 'utf8').replace(/\r\n/g, '\n')
    // These treatments belong to the generated palette, not a shadowed fallback.
    .replace(/\s*--ui-(?:primary-gradient|action-secondary-gradient(?:-hover)?|field-rest-gradient):\s*[^;]+;/g, '')
    .replace(blockPattern, (match, header, body, end) => {
      const mode = header.includes('dark') ? 'dark' : 'light';
      const control = controls[mode];
      const values = {
        'ui-primary-fill': middle(design.effects[mode].action.stops),
        'ui-on-primary': 'var(--ui-on-accent)',
        'ui-action-secondary-fill': middle(control.action.stops),
        'ui-action-secondary-fill-hover': middle(control.action.hoverStops),
        'ui-field-fill': middle(control.field.stops),
        'ui-field-fill-hover': middle(control.field.hoverStops)
      };
      return header + body.replace(/--([\w-]+):\s*([^;]+);/g, (declaration, name) => name in values ? `--${name}: ${values[name]};` : declaration) + end;
    });
  fs.writeFileSync(palettePath, palette);
  fs.writeFileSync(tokenPath, tokens);
  console.log('App surfaces synchronized from checked shared theme data.');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/sync-app-theme.mjs <AioLM project root>');
  syncAppTheme(process.argv[2]);
}