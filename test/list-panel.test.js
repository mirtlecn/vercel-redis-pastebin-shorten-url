import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE } from '../web/src/config.js';
import {
  formatCreatedLabel,
  formatTtlLabel,
  getItemTypeLabel,
  paginateListItems,
} from '../web/src/lib/list-panel.js';

test('formatTtlLabel keeps never for empty and rounds into h/d buckets', () => {
  assert.equal(formatTtlLabel(null), 'never');
  assert.equal(formatTtlLabel(30), '30m');
  assert.equal(formatTtlLabel(90), '2h');
  assert.equal(formatTtlLabel(1440), '1d');
});

test('formatCreatedLabel keeps illegal and formats valid dates', () => {
  assert.equal(formatCreatedLabel('illegal'), 'illegal');
  assert.equal(formatCreatedLabel('bad-value'), 'bad-value');
  assert.match(formatCreatedLabel('2026-03-20T08:09:00.000Z'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('getItemTypeLabel falls back to text metadata', () => {
  assert.equal(getItemTypeLabel('topic'), 'topic');
  assert.equal(getItemTypeLabel('custom'), 'custom');
  assert.equal(getItemTypeLabel(''), 'text');
});

test('paginateListItems decorates rows and clamps page number', () => {
  const items = Array.from({ length: PAGE_SIZE + 2 }, (_, index) => ({
    path: `item-${index + 1}`,
    type: 'text',
    ttl: index === 0 ? 30 : null,
    created: index === 0 ? '2026-03-20T08:09:00.000Z' : '',
    content: 'demo',
  }));

  const pageOne = paginateListItems(items, 1);
  assert.equal(pageOne.pages, 2);
  assert.equal(pageOne.safePage, 1);
  assert.equal(pageOne.rows.length, PAGE_SIZE);
  assert.equal(pageOne.rows[0].ttlText, '30m');

  const clamped = paginateListItems(items, 99);
  assert.equal(clamped.safePage, 2);
  assert.equal(clamped.rows.length, 2);
});
