// Renders the Mane Mitra React component to static SVG files so the README,
// favicon and docs use exactly the same drawing as the app.
// Usage: node scripts/export-mascot.mjs
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const out = new URL('../scripts/.mascot.tmp.mjs', import.meta.url)
await build({
  stdin: {
    contents: `import { renderToStaticMarkup } from 'react-dom/server'; import { createElement } from 'react'; import Mascot from './src/components/Mascot';
export const render = (mood, size) => renderToStaticMarkup(createElement(Mascot, { mood, size }))`,
    resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx',
  },
  bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic', outfile: out.pathname, logLevel: 'error',
})
const { render } = await import(pathToFileURL(out.pathname).href)
import('node:fs').then(fs => fs.rmSync(out))
const targets = [
  ['public/images/mascot', ''],
  ['../docs/assets', ''],
]
for (const [dir] of targets) mkdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true })
const svg = (mood, size) => render(mood, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
for (const [mood, name] of [['calm', 'mane-mitra'], ['happy', 'mane-mitra-happy'], ['guide', 'mane-mitra-guide']]) {
  writeFileSync(new URL(`../public/images/mascot/${name}.svg`, import.meta.url), svg(mood, 240))
}
writeFileSync(new URL('../../docs/assets/mascot.svg', import.meta.url), svg('guide', 240))
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg('calm', 64))
console.log('Mascot exported')
