import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicIndexMarkdown, renderTopicIndexHtml } from '../lib/services/topic-render.js';

test('buildTopicIndexMarkdown sorts by updatedAt and writes full dates inline', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'Anime', [
    {
      path: 'castle-notes',
      type: 'text',
      title: 'Castle in the Sky Notes',
      updatedAt: Date.UTC(2026, 11, 21, 10, 0, 0) / 1000,
    },
    {
      path: 'howl-visual',
      type: 'html',
      title: 'Howl Visual Draft',
      updatedAt: Date.UTC(2026, 11, 23, 10, 0, 0) / 1000,
    },
    {
      path: 'poster-pack-winter.zip',
      type: 'file',
      title: 'Poster Pack Winter',
      updatedAt: Date.UTC(2025, 9, 18, 10, 0, 0) / 1000,
    },
  ]);

  assert.equal(
    markdown,
    [
      '<div style="font-size: 1.3em; font-weight: bold">Anime</div>',
      '\n\n',
      '<span style="color: #666;">Home</span>',
      '\n\n\n\n\n\n',
      '- [Howl Visual Draft](</anime/howl-visual>) · 2026-12-23',
      '- [Castle in the Sky Notes](</anime/castle-notes>) ☰ · 2026-12-21',
      '- [Poster Pack Winter](</anime/poster-pack-winter.zip>) ◫ · 2025-10-18',
    ].join('\n'),
  );
});

test('buildTopicIndexMarkdown uses full path fallback and type marks', () => {
  const markdown = buildTopicIndexMarkdown('anime', 'anime', [
    {
      path: 'notes/howl-visual',
      fullPath: 'anime/notes/howl-visual',
      type: 'url',
      title: '',
      updatedAt: Date.UTC(2026, 11, 19, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /^<div style="font-size: 1.3em; font-weight: bold">Anime<\/div>/);
  assert.match(markdown, /\[notes\/howl-visual]\(<\/anime\/notes\/howl-visual>\) ↗ · 2026-12-19/);
});

test('buildTopicIndexMarkdown wraps hrefs so parentheses in paths stay unambiguous', () => {
  const markdown = buildTopicIndexMarkdown('anime(list)', 'anime(list)', [
    {
      path: 'notes/(draft)',
      type: 'text',
      title: 'Draft',
      updatedAt: Date.UTC(2026, 11, 19, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(markdown, /\[Draft]\(<\/anime\(list\)\/notes\/\(draft\)>\) ☰ · 2026-12-19/);
});

test('renderTopicIndexHtml uses topic title and root-relative links', () => {
  const html = renderTopicIndexHtml('anime', 'Anime', [
    {
      path: 'howl-visual',
      type: 'html',
      title: 'Howl Visual Draft',
      updatedAt: Date.UTC(2026, 11, 23, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(html, /<title>Anime<\/title>/);
  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">Anime<\/div>/);
  assert.match(html, /<span style="color: #666;">Home<\/span>/);
  assert.match(html, /Howl Visual Draft/);
  assert.match(html, /href="\/anime\/howl-visual"/);
});

test('renderTopicIndexHtml keeps nested topic links root-relative', () => {
  const html = renderTopicIndexHtml('blog/2026', '2026', [
    {
      path: 'post-1',
      type: 'text',
      title: 'Post 1',
      updatedAt: Date.UTC(2026, 11, 23, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(html, /href="\/blog\/2026\/post-1"/);
});

test('renderTopicIndexHtml preserves paths with parentheses in generated links', () => {
  const html = renderTopicIndexHtml('anime(list)', 'Anime', [
    {
      path: 'notes/(draft)',
      type: 'text',
      title: 'Draft',
      updatedAt: Date.UTC(2026, 11, 23, 10, 0, 0) / 1000,
    },
  ]);

  assert.match(html, /href="\/anime\(list\)\/notes\/\(draft\)"/);
});
