import { PAGE_SIZE } from '../config.js';

export function getItemTypeLabel(type) {
  switch (type) {
    case 'text':
    case 'file':
    case 'html':
    case 'topic':
    case 'url':
      return type;
    default:
      return type || 'text';
  }
}

export function formatTtlLabel(ttl) {
  if (ttl == null) return 'never';
  if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl <= 0) return 'never';
  if (ttl < 60) return `${Math.round(ttl)}m`;
  if (ttl < 1440) return `${Math.round(ttl / 60)}h`;
  return `${Math.round(ttl / 1440)}d`;
}

export function formatCreatedLabel(created) {
  if (!created) return '';
  if (created === 'illegal') return created;

  const date = new Date(created);
  if (Number.isNaN(date.getTime())) return created;

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function paginateListItems(items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).map((item) => ({
    ...item,
    createdText: formatCreatedLabel(item.created),
    ttlText: formatTtlLabel(item.ttl),
  }));

  return {
    pages,
    rows,
    safePage,
  };
}
