import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FEED_URL = 'https://ark-log.vercel.app/rss.xml';
const README_PATH = fileURLToPath(new URL('../README.md', import.meta.url));
const SECTIONS = { INSIGHT: 'Life', NOTES: 'Tech' };

function field(xml, name) {
  const value = xml.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')
  )?.[1];
  return (value ?? '')
    .trim()
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((item) => ({
    title: field(item[1], 'title'),
    link: field(item[1], 'link'),
    date: field(item[1], 'pubDate'),
    category: field(item[1], 'category'),
  }));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(posts, category) {
  const selected = posts.filter((post) => post.category === category).slice(0, 5);
  if (!selected.length) throw new Error(`No ${category} posts found`);

  return selected
    .map((post) => {
      const url = new URL(post.link);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported URL: ${post.link}`);
      }
      const date = new Date(post.date);
      if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${post.date}`);
      const shortDate = date.toISOString().slice(2, 10).replaceAll('-', '.');
      return `    <a href="${escapeHtml(url.href)}">${escapeHtml(post.title)}</a> <sub>${shortDate}</sub>`;
    })
    .join('\n    <br>\n');
}

function updateReadme(readme, posts) {
  for (const [marker, category] of Object.entries(SECTIONS)) {
    const pattern = new RegExp(
      `(<!-- ${marker}_START -->)[\\s\\S]*?(<!-- ${marker}_END -->)`
    );
    if (!pattern.test(readme)) throw new Error(`Missing ${marker} markers`);
    readme = readme.replace(
      pattern,
      (_, start, end) => `${start}\n${render(posts, category)}\n    ${end}`
    );
  }
  return readme;
}

function selfTest() {
  const item = (category) => `<item><title><![CDATA[A & B]]></title><link>https://example.com/${category}</link><pubDate>Tue, 28 Jul 2026 00:00:00 GMT</pubDate><category><![CDATA[${category}]]></category></item>`;
  const posts = parseFeed(item('Life') + item('Tech'));
  const readme = '<!-- INSIGHT_START --><!-- INSIGHT_END -->\n<!-- NOTES_START --><!-- NOTES_END -->';
  const updated = updateReadme(readme, posts);
  assert.match(updated, /A &amp; B<\/a> <sub>26\.07\.28<\/sub>/);
  assert.doesNotMatch(updated, /START --><!--/);
  console.log('Self-test passed.');
}

async function main() {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`RSS request failed: ${response.status}`);
  const readme = await readFile(README_PATH, 'utf8');
  const updated = updateReadme(readme, parseFeed(await response.text()));
  if (updated === readme) return console.log('Recent posts already current.');
  await writeFile(README_PATH, updated);
  console.log('README recent posts updated.');
}

if (process.argv.includes('--test')) selfTest();
else await main();
