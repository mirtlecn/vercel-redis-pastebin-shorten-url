import { useEffect, useState } from 'react';
import { icons } from '../icons/Icons.jsx';
import { IconButton } from './IconButton.jsx';

export function ResultPanel({ onCopy, result }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (copied) return;
    const ok = await onCopy(result.surl);
    if (ok) setCopied(true);
  }

  if (!result) return null;

  return (
    <section className="panel-box animate-fade-up">
      <div className="flex items-center justify-between gap-4">
        <a className="truncate text-lg font-semibold text-info hover:underline" href={result.surl} rel="noreferrer" target="_blank">
          {result.surl}
        </a>
        <div className="flex gap-2">
          <IconButton className={copied ? 'text-success' : ''} disabled={copied} icon={copied ? icons.check : icons.copy} onClick={handleCopy} title={copied ? 'Copied' : 'Copy'} />
          <IconButton icon={icons.open} onClick={() => window.open(result.surl, '_blank', 'noreferrer')} title="Open" />
        </div>
      </div>
      {result.created ? (
        <div className="mt-3 text-sm text-base-content/65">
          <span className="font-medium text-base-content/78">Created</span>
          <span className="mx-2 text-base-content/35">/</span>
          <span>{result.created}</span>
        </div>
      ) : null}
    </section>
  );
}
