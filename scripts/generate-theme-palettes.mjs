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
// Surface shading stays restrained. Brand icons, charts and narrow indicators
// deliberately keep their wider color range and are outside these budgets.
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
function readable(seed, surfaces, mode, minimum) {
  const end=mode==='dark'?[255,255,255]:[0,0,0], start=rgb(seed.slice(1));
  for(let i=0;i<=100;i++) {const c=hex(start.map((v,j)=>v*(1-i/100)+end[j]*i/100));if(surfaces.every(s=>ratio(c,s)>=minimum)) return c;}
  throw new Error('No accessible foreground');
}
function tokens(p, mode) {
  const c=p.themes[mode],e=p.effects[mode];
  const control = controlTones[mode];
  const secondaryStops = control.action.stops;
  const secondaryHoverStops = control.action.hoverStops;
  const secondaryInk = control.action.ink;
  const secondaryHoverInk = control.action.hoverInk;
  const fieldStops = control.field.stops;
  const fieldHoverStops = control.field.hoverStops;
  // Brand accents retain a modest sky/periwinkle transition. Semantic notices
  // and ordinary controls keep the stricter single-hue shading budget.
  // Keep the primary anchored to the selected icon's sky and periwinkle.
  // This catches a drift back to an unrelated deep-blue primary, even when
  // its contrast and shading checks would pass.
  const distance = (a, b) => Math.hypot(...rgb(a.slice(1)).map((v, i) => v - rgb(b.slice(1))[i]));
  if (distance(e.action.stops[0], p.gradient[0]) > 45 || distance(e.action.stops.at(-1), p.gradient[1]) > 45) throw new Error('Primary has drifted from the approved Orchid Periwinkle palette');
  assertSurfaceRange(e.action.stops, 7, mode + ' brand primary', 40);
  for (const name of ['rail', 'selected']) assertSurfaceRange(e[name].stops, 2.2, mode + ' brand ' + name, 20);
  for (const [name, stops, maximum] of [
    ['secondary', secondaryStops, 3.4], ['secondary hover', secondaryHoverStops, 3.4],
    ['field', fieldStops, 2.2], ['field hover', fieldHoverStops, 2.2],
    ...['soft', 'secondary', 'field', 'device'].map(name => [name, e[name].stops, 2.2])
  ]) assertSurfaceRange(stops, maximum, mode + ' ' + name);
  // Filled primary actions are identified by their visible label/icon. Check
  // that information across the entire gradient; a contrasting outer edge is
  // not required for such buttons (WCAG 1.4.11, Buttons example 30).
  // https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  // Focus and native selection markers still have their independent 3:1 checks.
  const actionBackgrounds=[c.bg,c.surface,c.field,...e.rail.stops];
  for (let i=0;i<e.action.stops.length-1;i++) {
    const a=rgb(e.action.stops[i].slice(1)),b=rgb(e.action.stops[i+1].slice(1));
    for(let n=0;n<=20;n++) {
      const color=hex(a.map((v,j)=>v+(b[j]-v)*n/20));
      if(ratio(e.action.inks[0],color)<4.8 || (mode==='dark' && actionBackgrounds.some(bg=>ratio(color,bg)<3))) throw new Error(`Insufficient ${mode} primary action contrast`);
    }
  }
  if (gradientSamples(e.action.stops).some(primary => secondaryStops.some(secondary => ratio(primary, secondary) < 1.5))) throw new Error('Primary action blends into secondary action');
  if(gradientSamples(secondaryStops).some(stop=>ratio(secondaryInk,stop)<4.8) || gradientSamples(secondaryHoverStops).some(stop=>ratio(secondaryHoverInk,stop)<4.8)) throw new Error(`Insufficient ${mode} secondary action contrast`);
  if([...gradientSamples(fieldStops),...gradientSamples(fieldHoverStops)].some(stop=>ratio(c.ink,stop)<4.8 || ratio(c.muted,stop)<4.5)) throw new Error(`Insufficient ${mode} field contrast`);
  const surfaces=[c.surface,...['canvas','field','selected','soft','secondary'].flatMap(k=>e[k].stops)];
  const accent=readable(p.primarySeed,surfaces,mode,4.8);
  const editIcon = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='m13 3 4 4M3 17l4-1L17 6a2.8 2.8 0 0 0-4-4L3 12z' fill='none' stroke='${c.muted.replace('#', '%23')}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
  const focus=readable(mode==='light' ? '#4668BC' : c.action,[...surfaces,...e.rail.stops,c.railHover],mode,3.2);
  const railError=readable(statusTones[mode].error.ink,[...e.rail.stops,c.railHover],mode,4.8);
  const tones = Object.fromEntries(Object.entries(statusTones[mode]).flatMap(([role, tone]) => {
    assertSurfaceRange(tone.stops, 2.2, mode + " " + role + " notice");
    if (gradientSamples(tone.stops).some(stop => ratio(tone.ink, stop) < 4.8 || ratio(c.ink, stop) < 4.8 || ratio(c.muted, stop) < 4.5) || ratio(tone.ink, c.bg) < 4.8) {
      throw new Error(`Insufficient ${mode} ${role} contrast`);
    }
    const entries = [[`tone-${role}-bg`, tone.stops[Math.floor(tone.stops.length / 2)]], [`tone-${role}-ink`, tone.ink], [`tone-${role}-gradient`, `linear-gradient(180deg in srgb,${tone.stops.join(',')})`]];
    if (tone.action) {
      for (const stops of [tone.action.stops, tone.action.hoverStops]) {
        assertSurfaceRange(stops, 3.4, mode + " " + role + " action");
        if (gradientSamples(stops).some(stop => ratio(tone.action.ink, stop) < 4.8)) throw new Error(`Insufficient ${mode} ${role} action contrast`);
      }
      entries.push([`tone-${role}-action-gradient`, `linear-gradient(180deg in srgb,${tone.action.stops.join(',')})`], [`tone-${role}-action-hover`, `linear-gradient(180deg in srgb,${tone.action.hoverStops.join(',')})`], [`tone-${role}-action-ink`, tone.action.ink]);
    }
    return entries;
  }));
  return {
    'ui-bg':c.bg,'ui-surface':c.surface,'ui-sidebar':c.rail,'ui-panel-raised':c.surface,'ui-menu-surface':c.surface,
    'ui-input':c.field,'ui-input-hover':c.soft,'ui-surface-muted':c.soft,'ui-edit-icon':editIcon,
    'ui-ink':c.ink,'ui-muted':c.muted,'ui-faint':c.muted,'ui-border':c.line,'ui-border-strong':focus,
    'ui-accent':accent,'ui-accent-solid':c.action,'ui-accent-solid-hover':c.action,'ui-accent-solid-active':c.action,'ui-on-accent':e.action.inks[0],
    'ui-accent-soft':c.soft,'ui-secondary-fg':e.soft.inks[0],'ui-border-accent':focus,'ui-focus':focus,
    // Secondary actions have their own surface; fields and menu rows stay quiet.
    'ui-action-secondary-gradient':`linear-gradient(180deg in srgb,${secondaryStops.join(',')})`,
    'ui-action-secondary-gradient-hover':`linear-gradient(180deg in srgb,${secondaryHoverStops.join(',')})`,
    'ui-action-secondary-ink':secondaryInk,
    'ui-action-secondary-ink-hover':secondaryHoverInk,
    'ui-rail':c.rail,'ui-rail-ink':c.railInk,'ui-rail-muted':c.railMuted,'ui-rail-hover':c.railHover,
    'ui-rail-border':`color-mix(in srgb, ${c.railInk} 18%, transparent)`,'ui-rail-focus':focus,'ui-rail-error':railError,
    'ui-rail-action-hover':c.action,'ui-nav-fill':e.selected.css,'ui-nav-ink':e.selected.inks[0],
    'ui-mono-bg':c.field,'ui-mono-ink':c.ink,
    'brand-cyan':p.gradient[0],'brand-blue':p.gradient[1],'brand-violet':p.gradient[2],
    'brand-gradient':`linear-gradient(115deg,${p.gradient.join(',')})`,'ui-brand-icon':`url('/brand/themes/${p.id}.png')`,
    ...Object.fromEntries(Object.entries(e).map(([k,v])=>[`ui-${k}-gradient`,v.css])),
    'ui-field-rest-gradient':`linear-gradient(180deg in srgb,${fieldStops.join(',')})`,
    'ui-field-hover-gradient':`linear-gradient(180deg in srgb,${fieldHoverStops.join(',')})`,
    'ui-mono-gradient':e.field.css,
    'ui-soft-ink':e.soft.inks[0],'ui-selected-ink':e.selected.inks[0],'ui-secondary-ink':e.secondary.inks[0],
    'ui-elev-menu':mode==='dark'?'0 8px 24px rgb(0 0 0 / 26%)':'0 8px 24px rgb(35 40 70 / 12%)',
    'ui-elev-2':mode==='dark'?'0 16px 48px rgb(0 0 0 / 26%)':'0 16px 48px rgb(35 40 70 / 12%)',
    'tone-neutral-bg':c.field,'tone-neutral-ink':c.muted,
    ...tones
  };
}
const rule=(selectors,t)=>selectors+' {\n'+Object.entries(t).map(([k,v])=>`  --${k}: ${v};`).join('\n')+'\n}';
const palette = palettes[0];
let css='/* Orchid Periwinkle: approved light/dark colors and gradients. */\n';
css+=rule(':root',tokens(palette,'light'))+'\n';
css+='@media (prefers-color-scheme: dark) {\n'+rule(':root',tokens(palette,'dark'))+'\n}\n';
css+=':root { color-scheme: light dark; }\n';
fs.mkdirSync('src/theme',{recursive:true});
fs.writeFileSync('src/theme/palettes.css',css);
console.log('Generated Orchid Periwinkle light and dark colors.');
