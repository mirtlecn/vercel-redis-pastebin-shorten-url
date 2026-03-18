import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMarkdownToHtml } from '../lib/utils/converter.js';
import { getEmbeddedAssetUrl } from '../lib/assets/index.js';

test('convertMarkdownToHtml writes page title and topic backlink', () => {
  const html = convertMarkdownToHtml('# Hello', {
    pageTitle: 'Anime Archive',
    topicBackLink: '/anime',
    topicBackLabel: 'anime',
  });

  assert.match(html, /<title>Anime Archive<\/title>/);
  assert.match(html, /href="\/anime"/);
  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">anime<\/div>/);
  assert.match(html, /<strong>Home<\/strong>/);
  assert.match(html, /<a href="\/anime"><strong>Home<\/strong><\/a> \/  <span style="color: #666;">Anime Archive<\/span>/);
});

test('convertMarkdownToHtml escapes topic label and page title in topic header', () => {
  const html = convertMarkdownToHtml('# Hello', {
    pageTitle: '<Escaped>',
    topicBackLink: '/anime',
    topicBackLabel: '<Anime>',
  });

  assert.match(html, /<div style="font-size: 1.3em; font-weight: bold">&lt;Anime&gt;<\/div>/);
  assert.match(html, /<a href="\/anime"><strong>Home<\/strong><\/a> \/  <span style="color: #666;">&lt;Escaped&gt;<\/span>/);
});

test('convertMarkdownToHtml omits title suffix when pageTitle is missing', () => {
  const html = convertMarkdownToHtml('# Hello', {
    topicBackLink: '/anime',
    topicBackLabel: 'anime',
  });

  assert.match(html, /<strong>Home<\/strong>/);
  assert.doesNotMatch(html, /color: #666/);
});

test('convertMarkdownToHtml keeps empty title tag when pageTitle is missing', () => {
  const html = convertMarkdownToHtml('# Hello');

  assert.match(html, /<title><\/title>/);
});

test('convertMarkdownToHtml uses embedded base asset', () => {
  const html = convertMarkdownToHtml('# Hello');

  assert.match(html, new RegExp(getEmbeddedAssetUrl('base_css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/gh\/mirtlecn\/public\/ravel-gfm/);
});

test('convertMarkdownToHtml injects embedded highlight assets for code blocks', () => {
  const html = convertMarkdownToHtml('```js\nconsole.log("hi")\n```');

  assert.match(html, new RegExp(getEmbeddedAssetUrl('highlight_light_css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(getEmbeddedAssetUrl('highlight_dark_css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(getEmbeddedAssetUrl('highlight_js').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('convertMarkdownToHtml injects embedded toc assets when enough headings exist', () => {
  const html = convertMarkdownToHtml('# One\n\n## Two');

  assert.match(html, new RegExp(getEmbeddedAssetUrl('gfm_addon_css').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(getEmbeddedAssetUrl('gfm_addon_js').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
