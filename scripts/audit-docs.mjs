import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const readme = readFileSync('README.md', 'utf8');
const source = readFileSync('src/index.ts', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fails = [];

const slug = (heading) =>
  heading
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const unique = (matches) => [...new Set(matches)];
const all = (text, re) => unique([...text.matchAll(re)].map((m) => m[1]));

const anchors = new Set(all(readme, /^#{1,6} (.+)$/gm).map(slug));
for (const anchor of all(readme, /\]\(#([\w-]+)\)/g)) {
  if (!anchors.has(anchor)) fails.push(`README anchor #${anchor} has no heading`);
}

for (const rel of all(readme, /\]\((\.\/[^)]+)\)/g)) {
  if (!existsSync(rel)) fails.push(`README links a missing file: ${rel}`);
}

const playground = readFileSync('docs/index.html', 'utf8');
for (const page of [
  ...all(readme, /wordpaste\/(examples\/[\w.-]+\.html)/g),
  ...all(playground, /href="\.\/(examples\/[\w.-]+\.html)"/g),
]) {
  if (!existsSync(join('docs', page))) fails.push(`links a missing example: docs/${page}`);
}

// Handles both `export { a, b } from …` on one line and the multi-line form.
const exported = new Set(
  [...source.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(','))
    .map((name) => name.trim())
    .filter((name) => name && !name.startsWith('type '))
    .map((name) => name.split(/\s+as\s+/).pop()),
);
for (const name of all(readme, /^### `(\w+)\(/gm)) {
  if (!exported.has(name)) fails.push(`README documents \`${name}\`, which is not exported`);
}
for (const name of exported) {
  if (!readme.includes(name)) fails.push(`export \`${name}\` is not mentioned in the README`);
}

for (const field of [
  'name', 'version', 'description', 'keywords', 'license', 'author',
  'repository', 'homepage', 'bugs', 'type', 'main', 'types', 'exports',
  'files', 'sideEffects',
]) {
  if (!(field in pkg)) fails.push(`package.json is missing "${field}"`);
}

// Unpinned CDN imports get served from a stale cache after a release.
for (const file of ['README.md', ...walk('docs').filter((f) => f.endsWith('.html'))]) {
  const text = readFileSync(file, 'utf8');

  if (/esm\.sh\/wordpaste['"]/.test(text)) {
    fails.push(`${file} imports wordpaste from an unpinned CDN URL`);
  }
  for (const pinned of all(text, /esm\.sh\/wordpaste@([\d.]+)/g)) {
    if (pinned !== pkg.version) {
      fails.push(`${file} pins wordpaste@${pinned}, but package.json is ${pkg.version}`);
    }
  }

  if (file.endsWith('.html')) {
    if (text.includes('Extension.create')) fails.push(`${file} still shows the old Extension API`);
    if (text.includes('stripInlineColors(isWordHtml')) fails.push(`${file} still shows the old composition`);
  }
}

for (const manager of ['npm install wordpaste', 'pnpm add wordpaste', 'yarn add wordpaste', 'bun add wordpaste']) {
  if (!readme.includes(manager)) fails.push(`README is missing the install line: ${manager}`);
}

if (fails.length) {
  console.error('Docs audit failed:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Docs audit passed: links, anchors, exports and package metadata all agree.');
