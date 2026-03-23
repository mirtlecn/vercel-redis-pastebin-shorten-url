import { useEffect, useMemo, useState } from 'react';
import { COPY_FEEDBACK_MS, DELETE_CONFIRM_MS } from '../config.js';
import { getItemTypeLabel, paginateListItems } from '../lib/list-panel.js';
import { ListPanelRow } from './ListPanelRow.jsx';

export function ListPanel({ items, onCopy, onDelete, page, setPage }) {
  const [confirmPath, setConfirmPath] = useState('');
  const [deletingPath, setDeletingPath] = useState('');
  const [copiedPath, setCopiedPath] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const { pages, rows, safePage } = useMemo(() => paginateListItems(items, page), [items, page]);
  const actionTooltip = isMobile ? 'left' : 'top';

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

  const tableClassName = isMobile ? 'table table-zebra w-full' : 'table table-zebra table-fixed w-full';
  const pathColumnClassName = isMobile ? 'w-[10rem] max-w-[10rem]' : 'w-[18rem] max-w-[18rem]';
  const metaColumnClassName = isMobile ? 'w-[8.5rem] max-w-[8.5rem]' : 'w-[12rem] max-w-[12rem]';
  const actionColumnClassName = isMobile ? 'w-[8rem] text-right' : 'w-[11rem] text-right';
  const previewColumnClassName = isMobile ? 'min-w-[8rem] max-w-[10rem] truncate text-base-content/62' : 'max-w-md truncate text-base-content/62';

  return (
    <section className="panel-box">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">Links</div>
      <div className="list-scroll max-h-[30rem] overflow-auto rounded-[1.5rem] border border-base-300/70">
        <table className={tableClassName}>
          <thead>
            <tr>
              <th className={pathColumnClassName}>Path</th>
              <th className={metaColumnClassName}>Meta</th>
              <th>Preview</th>
              <th className={actionColumnClassName}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <ListPanelRow
                actionTooltip={actionTooltip}
                confirmPath={confirmPath}
                copiedPath={copiedPath}
                deletingPath={deletingPath}
                item={item}
                key={item.path}
                metaColumnClassName={metaColumnClassName}
                onConfirmDelete={confirmDelete}
                onCopyLink={copyLink}
                onOpenLink={(surl) => {
                  setConfirmPath('');
                  window.open(surl, '_blank', 'noreferrer');
                }}
                pathColumnClassName={pathColumnClassName}
                previewColumnClassName={previewColumnClassName}
                typeLabel={getItemTypeLabel(item.type)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
          {'<'}
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`btn btn-sm ${n === safePage ? 'btn-active' : ''}`} onClick={() => setPage(n)}>
            {n}
          </button>
        ))}
        <button className="btn btn-sm" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
          {'>'}
        </button>
      </div>
    </section>
  );
}
