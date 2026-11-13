import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ICON_DIR = 'node_modules/lucide-static/icons';

/** Sammelt alle Icon-Namen, die im Quelltext in Anführungszeichen vorkommen, und setzt sie als ein SVG-Sprite in die Seite. */
function iconSprite() {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : /\.(svelte|js)$/.test(e.name) ? [join(dir, e.name)] : []));
  return {
    name: 'icon-sprite',
    transformIndexHtml(html) {
      const names = new Set();
      for (const f of walk('web/src')) for (const m of readFileSync(f, 'utf8').matchAll(/['"]([a-z][a-z0-9-]*)['"]/g)) if (existsSync(join(ICON_DIR, m[1] + '.svg'))) names.add(m[1]);
      const symbols = [...names].sort().map(n => {
        const inner = readFileSync(join(ICON_DIR, n + '.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '');
        return `<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`;
      });
      return html.replace('<!--icons-->', `<svg width="0" height="0" class="sprite" aria-hidden="true"><!-- Lucide Icons (ISC), lucide.dev --><defs>${symbols.join('')}</defs></svg>`);
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [svelte(), iconSprite()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8080', xfwd: true }, '/photos': 'http://127.0.0.1:8080' } },
});
