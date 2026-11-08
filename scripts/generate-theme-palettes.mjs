import fs from 'node:fs';
const palettes = JSON.parse(fs.readFileSync('src/theme/palette-data.json', 'utf8'));
const statusTones = JSON.parse(fs.readFileSync('src/theme/status-tones.json', 'utf8'));
const controlTones = JSON.parse(fs.readFileSync('src/theme/control-tones.json', 'utf8'));
if (palettes.length !== 1 || palettes[0].id !== '13') throw new Error('The product uses Orchid Periwinkle as its only palette.');
const rgb = c => c.match(/\w\w/g).map(x => parseInt(x,16));
const hex = a => '#'+a.map(x=>Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase();
const lum = c => rgb(c.slice(1)).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
function gradientSamples(stops) {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error('A gradient needs at least two stops.');
  return stops.slice(1).flatMap((stop, i) => {
    const a = rgb(stops[i].slice(1)), b = rgb(stop.slice(1));
    return Array.from({length: 21}, (_, n) => hex(a.map((v, j) => v + (b[j] - v) * n / 20)));
  });
}
// Only primary actions and navigation retain the app's brand shading.
function assertSurfaceRange(stops, maximum, label, chromaticMaximum = 6) {
  const samples = gradientSamples(stops);
  const levels = samples.map(color => {
    const y = lum(color);
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : 24389 / 27 * y;
  });
  // Subtract common brightness from each RGB triplet. A small spread in these
  // channel offsets prevents a surface from rotating into another hue or
  // ramping from neutral to strongly tinted while its L* happens to stay flat.
  const offsets = samples.map(color => {
    const channels = rgb(color.slice(1));
    const mean = channels.reduce((sum, value) => sum + value, 0) / 3;
    return channels.map(value => value - mean);
  });
  const chromaticSpread = Math.hypot(...[0, 1, 2].map(i => Math.max(...offsets.map(c => c[i])) - Math.min(...offsets.map(c => c[i]))));
  if (chromaticSpread > chromaticMaximum) throw new Error('Excessive hue or tint variation in ' + label + ': ' + chromaticSpread.toFixed(2));
  const span = Math.max(...levels) - Math.min(...levels);
  if (span < 0.3 || span > maximum) throw new Error('Unrestrained or flat ' + label + ' surface gradient: ' + span.toFixed(2));
}
function requireContrast(ink, surfaces, minimum, label) {
  if (surfaces.some(surface => ratio(ink, surface) < minimum)) {
    throw new Error(`Insufficient ${label} contrast`);
  }
}
function tokens(palette, mode) {
  const c = palette.themes[mode];
  const effects = palette.effects[mode];
  const control = controlTones[mode];
  const gradient = effect => `linear-gradient(${effect.angle}deg in srgb,${effect.stops.join(',')})`;
  const distance = (a, b) => Math.hypot(...rgb(a.slice(1)).map((value, index) => value - rgb(b.slice(1))[index]));
  if (distance(effects.action.stops[0], palette.gradient[0]) > 45 || distance(effects.action.stops.at(-1), palette.gradient[1]) > 45) {
    throw new Error('Primary has drifted from the approved Orchid Periwinkle palette');
  }
  const fields = [control.field.fill, control.field.hover];
  const surfaces = [c.bg, c.surface, c.soft, c.field, c.inputHover, ...fields];
  for (const [name, effect] of Object.entries(effects)) {
    assertSurfaceRange(effect.stops, name === 'action' ? 7 : 2.2, `${mode} ${name}`, name === 'action' ? 40 : 20);
    const inks = name === 'action' ? [c.actionInk] : name === 'rail' ? [c.railInk, c.railMuted] : [c.selectedInk];
    for (const ink of inks) requireContrast(ink, gradientSamples(effect.stops), 4.5, `${mode} ${name}`);
  }
  requireContrast(c.ink, surfaces, 4.5, `${mode} body`);
  requireContrast(c.muted, surfaces, 4.5, `${mode} supporting text`);
  requireContrast(c.accent, surfaces, 4.5, `${mode} links`);
  requireContrast(c.focus, [...surfaces, c.rail, c.selected], 3, `${mode} focus`);
  requireContrast(c.lineStrong, [c.surface, control.field.fill], 3, `${mode} field boundary`);
  requireContrast(c.lineStrongest, [control.field.hover], 3, `${mode} hovered field boundary`);
  requireContrast(control.action.ink, [control.action.fill], 4.5, `${mode} secondary action`);
  requireContrast(control.action.hoverInk, [control.action.hover], 4.5, `${mode} secondary hover`);
  const tones = {};
  for (const [role, tone] of Object.entries(statusTones[mode])) {
    requireContrast(tone.ink, [tone.fill, c.bg], 4.5, `${mode} ${role}`);
    requireContrast(c.ink, [tone.fill], 4.5, `${mode} ${role} body`);
    requireContrast(c.muted, [tone.fill], 4.5, `${mode} ${role} supporting text`);
    tones[`tone-${role}-bg`] = tone.fill;
    tones[`tone-${role}-ink`] = tone.ink;
    if (tone.action) {
      requireContrast(tone.action.ink, [tone.action.fill, tone.action.hover], 4.5, `${mode} ${role} action`);
      tones[`tone-${role}-action-fill`] = tone.action.fill;
      tones[`tone-${role}-action-hover`] = tone.action.hover;
      tones[`tone-${role}-action-ink`] = tone.action.ink;
    }
  }
  return {
    'ui-bg': c.bg, 'ui-surface': c.surface, 'ui-sidebar': c.rail,
    'ui-panel-raised': c.surface, 'ui-menu-surface': c.surface,
    'ui-input': c.field, 'ui-input-hover': c.inputHover, 'ui-surface-muted': c.soft,
    'ui-field-fill': control.field.fill, 'ui-field-fill-hover': control.field.hover,
    'ui-ink': c.ink, 'ui-muted': c.muted, 'ui-faint': c.muted,
    'ui-border': c.line, 'ui-border-strong': c.lineStrong, 'ui-border-strongest': c.lineStrongest,
    'ui-accent': c.accent, 'ui-focus': c.focus,
    'ui-accent-solid': c.action, 'ui-accent-solid-hover': c.action, 'ui-accent-solid-active': c.action,
    'ui-on-accent': c.actionInk, 'ui-accent-soft': c.soft,
    'ui-secondary-fg': c.softInk, 'ui-border-accent': c.lineAccent,
    'ui-action-secondary-fill': control.action.fill,
    'ui-action-secondary-fill-hover': control.action.hover,
    'ui-action-secondary-ink': control.action.ink,
    'ui-action-secondary-ink-hover': control.action.hoverInk,
    'ui-rail': c.rail, 'ui-rail-ink': c.railInk, 'ui-rail-muted': c.railMuted,
    'ui-rail-hover': c.railHover,
    'ui-rail-border': `color-mix(in srgb, ${c.railInk} 18%, transparent)`,
    'ui-rail-focus': c.focus, 'ui-rail-error': statusTones[mode].error.ink,
    'ui-nav-fill': gradient(effects.selected), 'ui-nav-ink': c.selectedInk,
    'ui-mono-bg': c.field, 'ui-mono-ink': c.ink,
    'ui-brand-icon': `url('/brand/themes/${palette.id}.png')`,
    'ui-action-gradient': gradient(effects.action), 'ui-rail-gradient': gradient(effects.rail),
    'ui-primary-hover-veil': mode === 'light' ? 'rgb(0 0 0 / 8%)' : 'rgb(255 255 255 / 10%)',
    'ui-primary-active-veil': mode === 'light' ? 'rgb(0 0 0 / 14%)' : 'rgb(255 255 255 / 18%)',
    'ui-soft-ink': c.softInk, 'ui-selected-ink': c.selectedInk,
    'ui-secondary-fill': c.secondary, 'ui-secondary-ink': c.secondaryInk,
    'ui-elev-menu': mode === 'dark' ? '0 8px 28px rgb(0 0 0 / 40%)' : '0 8px 28px rgb(16 19 23 / 14%), 0 1px 3px rgb(16 19 23 / 10%)',
    'ui-elev-2': mode === 'dark' ? '0 16px 48px rgb(0 0 0 / 50%)' : '0 16px 48px rgb(16 19 23 / 20%)',
    'tone-neutral-bg': c.soft, 'tone-neutral-ink': c.muted,
    ...tones,
  };
}
const rule=(selectors,t)=>selectors+' {\n'+Object.entries(t).map(([k,v])=>`  --${k}: ${v};`).join('\n')+'\n}';
const palette = palettes[0];
let css='/* Generated from the app-aligned Orchid Periwinkle palette. Run npm run theme:generate. */\n';
css+=rule(':root',tokens(palette,'light'))+'\n';
css+='@media (prefers-color-scheme: dark) {\n'+rule(':root',tokens(palette,'dark'))+'\n}\n';
css+=':root { color-scheme: light dark; }\n';
fs.mkdirSync('src/theme',{recursive:true});
fs.writeFileSync('src/theme/palettes.css',css);
console.log('Generated Orchid Periwinkle light and dark colors.');
