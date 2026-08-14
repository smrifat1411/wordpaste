// Fails the build when the docs and the code disagree.
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

// Every #anchor in the README resolves to a heading.
const anchors = new Set(all(readme, /^#{1,6} (.+)$/gm).map(slug));
for (const anchor of all(readme, /\]\(#([\w-]+)\)/g)) {
  if (!anchors.has(anchor)) fails.push(`README anchor #${anchor} has no heading`);
}

// Every relative link points at a file that exists.
for (const rel of all(readme, /\]\((\.\/[^)]+)\)/g)) {
  if (!existsSync(rel)) fails.push(`README links a missing file: ${rel}`);
}

// Every example page the README or playground advertises is really shipped.
const playground = readFileSync('docs/index.html', 'utf8');
for (const page of [
  ...all(readme, /wordpaste\/(examples\/[\w.-]+\.html)/g),
  ...all(playground, /href="\.\/(examples\/[\w.-]+\.html)"/g),
]) {
  if (!existsSync(join('docs', page))) fails.push(`links a missing example: docs/${page}`);
}

// Every documented export exists, and every export is documented.
const exported = new Set(all(source, /^\s*(\w+),$/gm));
for (const name of all(readme, /^### `(\w+)\(/gm)) {
  if (!exported.has(name)) fails.push(`README documents \`${name}\`, which is not exported`);
}
for (const name of exported) {
  if (!readme.includes(`\`${name}`)) fails.push(`export \`${name}\` is undocumented`);
}

// npm shows a poor package page without these.
for (const field of [
  'name', 'version', 'description', 'keywords', 'license', 'author',
  'repository', 'homepage', 'bugs', 'type', 'main', 'types', 'exports',
  'files', 'sideEffects',
]) {
  if (!(field in pkg)) fails.push(`package.json is missing "${field}"`);
}

for (const file of walk('docs').filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');

  // No shipped page still teaches a removed API.
  if (html.includes('Extension.create')) fails.push(`${file} still shows the old Extension API`);
  if (html.includes('stripInlineColors(isWordHtml')) fails.push(`${file} still shows the old composition`);

  // Demo pages must pin the CDN import to this exact version. An unpinned URL
  // gets served from a stale browser cache after a release, which silently
  // breaks every page for anyone who visited before.
  if (/esm\.sh\/wordpaste['"]/.test(html)) {
    fails.push(`${file} imports wordpaste from an unpinned CDN URL`);
  }
  for (const pinned of all(html, /esm\.sh\/wordpaste@([\d.]+)/g)) {
    if (pinned !== pkg.version) {
      fails.push(`${file} pins wordpaste@${pinned}, but package.json is ${pkg.version}`);
    }
  }
}

if (fails.length) {
  console.error('Docs audit failed:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Docs audit passed: links, anchors, exports and package metadata all agree.');
