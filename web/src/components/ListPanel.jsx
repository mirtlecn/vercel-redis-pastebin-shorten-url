import { useEffect, useMemo, useState } from 'react';
import { COPY_FEEDBACK_MS, DELETE_CONFIRM_MS, PAGE_SIZE } from '../config.js';
import { icons } from '../icons/Icons.jsx';
import { IconButton } from './IconButton.jsx';

export function ListPanel({ items, onCopy, onDelete, page, setPage }) {
  const [confirmPath, setConfirmPath] = useState('');
  const [deletingPath, setDeletingPath] = useState('');
  const [copiedPath, setCopiedPath] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const pages = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);
  const safe = useMemo(() => Math.min(page, pages), [page, pages]);
  const actionTooltip = isMobile ? 'left' : 'top';

  function ttlLabel(ttl) {
    if (ttl == null) return 'never';
    if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl <= 0) return 'never';
    if (ttl < 60) return `${Math.round(ttl)}m`;
    if (ttl < 1440) return `${Math.round(ttl / 60)}h`;
    return `${Math.round(ttl / 1440)}d`;
  }

  const rows = useMemo(
    () => items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE).map((item) => ({ ...item, ttlText: ttlLabel(item.ttl) })),
    [items, safe],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (confirmPath && !items.some((item) => item.path === confirmPath)) setConfirmPath('');
    if (deletingPath && !items.some((item) => item.path === deletingPath)) setDeletingPath('');
    if (copiedPath && !items.some((item) => item.path === copiedPath)) setCopiedPath('');
  }, [items, confirmPath, deletingPath, copiedPath]);

  useEffect(() => {
    if (!copiedPath) return undefined;
    const timer = window.setTimeout(() => setCopiedPath(''), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copiedPath]);

  useEffect(() => {
    if (!confirmPath) return undefined;
    const timer = window.setTimeout(() => setConfirmPath(''), DELETE_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmPath]);

  useEffect(() => {
    if (!confirmPath) return undefined;
    function onDocumentPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        setConfirmPath('');
        return;
      }
      const button = target.closest('[data-delete-btn="true"]');
      if (button?.getAttribute('data-path') === confirmPath) return;
      setConfirmPath('');
    }
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [confirmPath]);

  async function confirmDelete(path) {
    if (deletingPath) return;
    if (confirmPath !== path) {
      setConfirmPath(path);
      return;
    }
    setDeletingPath(path);
    try {
      const item = items.find((entry) => entry.path === path);
      if (!item) return;
      await onDelete(item);
    } finally {
      setDeletingPath('');
      setConfirmPath('');
    }
  }

  async function copyLink(path, surl) {
    if (copiedPath) return;
    setConfirmPath('');
    const ok = await onCopy(surl);
    if (ok) setCopiedPath(path);
  }

  return (
    <section className="panel-box">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">Links</div>
      <div className="list-scroll max-h-[30rem] overflow-auto rounded-[1.5rem] border border-base-300/70">
        <table className="table table-zebra table-fixed w-full">
          <thead>
            <tr>
              <th className="w-[12rem]">Path</th>
              <th className="w-[8rem]">Type</th>
              <th className="w-[8rem]">TTL</th>
              <th className="w-[14rem]">Created</th>
              <th>Preview</th>
              <th className="w-[14rem] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.path}>
                <td className="w-[12rem] max-w-[12rem]">
                  <span className="block truncate font-medium" title={item.path}>{item.path}</span>
                  {item.title ? (
                    <span className="mt-1 block truncate text-xs text-base-content/55" title={item.title}>
                      {item.title}
                    </span>
                  ) : null}
                </td>
                <td className="w-[8rem] max-w-[8rem]">
                  <span className="block truncate" title={item.type}>{item.type}</span>
                </td>
                <td className="w-[8rem] max-w-[8rem] whitespace-nowrap text-base-content/65">
                  <span className="block truncate" title={item.ttlText}>{item.ttlText}</span>
                </td>
                <td className="w-[14rem] max-w-[14rem] whitespace-nowrap text-sm text-base-content/65">
                  <span className="block truncate" title={item.created || ''}>{item.created || ''}</span>
                </td>
                <td className="max-w-md truncate" title={item.content}>{item.content}</td>
                <td className="overflow-visible">
                  <div className="flex justify-end gap-2 overflow-visible">
                    <IconButton icon={icons.open} onClick={() => { setConfirmPath(''); window.open(item.surl, '_blank', 'noreferrer'); }} title="Open" tooltip={actionTooltip} />
                    <IconButton
                      className={copiedPath === item.path ? 'text-success' : ''}
                      disabled={copiedPath === item.path}
                      icon={copiedPath === item.path ? icons.check : icons.copy}
                      onClick={() => copyLink(item.path, item.surl)}
                      title={copiedPath === item.path ? 'Copied' : 'Copy'}
                      tooltip={actionTooltip}
                    />
                    {deletingPath === item.path ? (
                      <IconButton className="text-error opacity-80" disabled icon={icons.refresh} iconClassName="animate-spin" title="Deleting..." tooltip={actionTooltip} />
                    ) : (
                      <IconButton
                        className={confirmPath === item.path ? 'text-warning hover:bg-warning/10' : 'text-error hover:bg-error/10'}
                        data-delete-btn="true"
                        data-path={item.path}
                        icon={confirmPath === item.path ? icons.check : icons.delete}
                        onClick={() => confirmDelete(item.path)}
                        title={confirmPath === item.path ? 'Delete?' : 'Delete'}
                        tooltip={actionTooltip}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn btn-sm" disabled={safe <= 1} onClick={() => setPage(safe - 1)}>
          {'<'}
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`btn btn-sm ${n === safe ? 'btn-active' : ''}`} onClick={() => setPage(n)}>
            {n}
          </button>
        ))}
        <button className="btn btn-sm" disabled={safe >= pages} onClick={() => setPage(safe + 1)}>
          {'>'}
        </button>
      </div>
    </section>
  );
}
