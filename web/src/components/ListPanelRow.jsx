import { icons } from '../icons/Icons.jsx';
import { IconButton } from './IconButton.jsx';

function getTypeIcon(typeLabel) {
  switch (typeLabel) {
    case 'file':
      return icons.fileBadge;
    case 'html':
      return icons.fileCode;
    case 'topic':
      return icons.folderTree;
    case 'url':
      return icons.link;
    case 'text':
    default:
      return icons.text;
  }
}

export function ListPanelRow({
  actionTooltip,
  confirmPath,
  copiedPath,
  deletingPath,
  item,
  onConfirmDelete,
  onCopyLink,
  onOpenLink,
  pathColumnClassName,
  previewColumnClassName,
  typeLabel,
  metaColumnClassName,
}) {
  const TypeIcon = getTypeIcon(typeLabel);

  return (
    <tr>
      <td className={pathColumnClassName}>
        <span className="block truncate font-medium" title={item.path}>{item.path}</span>
        {item.title ? (
          <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-base-content/55" title={`${item.title} · ${typeLabel}`}>
            <TypeIcon className="size-3 shrink-0 opacity-55" strokeWidth={2} />
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 text-base-content/38">·</span>
            <span className="shrink-0 lowercase text-base-content/42">{typeLabel}</span>
          </span>
        ) : (
          <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-base-content/42 lowercase" title={typeLabel}>
            <TypeIcon className="size-3 shrink-0 opacity-55" strokeWidth={2} />
            <span className="truncate">{typeLabel}</span>
          </span>
        )}
      </td>
      <td className={metaColumnClassName}>
        <span className="block truncate text-sm text-base-content/72" title={item.created || ''}>
          {item.createdText || 'unknown'}
        </span>
        <span className="mt-1 block truncate text-xs text-base-content/42" title={item.ttlText}>
          {item.ttlText === 'never' ? 'never expires' : `TTL ${item.ttlText}`}
        </span>
      </td>
      <td className={previewColumnClassName} title={item.content}>{item.content}</td>
      <td className="overflow-visible">
        <div className="flex justify-end gap-1.5 overflow-visible">
          <IconButton icon={icons.open} onClick={() => onOpenLink(item.surl)} title="Open" tooltip={actionTooltip} />
          <IconButton
            className={copiedPath === item.path ? 'text-success' : ''}
            disabled={copiedPath === item.path}
            icon={copiedPath === item.path ? icons.check : icons.copy}
            onClick={() => onCopyLink(item.path, item.surl)}
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
              onClick={() => onConfirmDelete(item.path)}
              title={confirmPath === item.path ? 'Delete?' : 'Delete'}
              tooltip={actionTooltip}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
