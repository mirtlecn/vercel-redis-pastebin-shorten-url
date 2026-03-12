import { PAGE_SIZE } from '../config.js';
import { icons } from '../icons/Icons.jsx';
import { IconButton } from './IconButton.jsx';

export function ListPanel({ items, onCopy, onDelete, page, setPage }) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safe = Math.min(page, pages);
  const ttlLabel = (ttl) => {
    if (ttl == null) return 'permanent';
    if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl <= 0) return 'permanent';
    if (ttl < 60) return `${Math.round(ttl)}m`;
    if (ttl < 1440) return `${Math.round(ttl / 60)}h`;
    return `${Math.round(ttl / 1440)}d`;
  };
  const rows = items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE).map((item) => ({ ...item, ttlText: ttlLabel(item.ttl) }));

  return (
    <section className="panel-box">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">Links</div>
      <div className="list-scroll max-h-[30rem] overflow-auto rounded-[1.5rem] border border-base-300/70">
        <table className="table table-zebra table-fixed w-full">
          <thead>
            <tr>
              <th className="w-[14rem]">Path</th>
              <th className="w-[8rem]">Type</th>
              <th className="w-[8rem]">TTL</th>
              <th>Preview</th>
              <th className="w-[14rem] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.path}>
                <td className="w-[14rem] max-w-[14rem]">
                  <span className="block truncate" title={item.path}>{item.path}</span>
                </td>
                <td className="w-[8rem] max-w-[8rem]">
                  <span className="block truncate" title={item.type}>{item.type}</span>
                </td>
                <td className="w-[8rem] max-w-[8rem] whitespace-nowrap text-base-content/65">
                  <span className="block truncate" title={item.ttlText}>{item.ttlText}</span>
                </td>
                <td className="max-w-md truncate" title={item.content}>{item.content}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <IconButton icon={icons.open} onClick={() => window.open(item.surl, '_blank', 'noreferrer')} title="Open" tooltip="top" />
                    <IconButton icon={icons.copy} onClick={() => onCopy(item.surl)} title="Copy" tooltip="top" />
                    <IconButton className="text-error hover:bg-error/10" icon={icons.delete} onClick={() => onDelete(item.path)} title="Delete" tooltip="top" />
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
