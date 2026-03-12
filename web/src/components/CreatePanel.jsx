import { useEffect, useRef, useState } from 'react';
import { icons } from '../icons/Icons.jsx';
import { useComposer } from '../hooks/useComposer.js';

export function CreatePanel(props) {
  const composer = useComposer(props);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const globalDragDepthRef = useRef(0);
  const fileInputRef = useRef(null);
  const CloseIcon = icons.close;
  const FileBadgeIcon = icons.fileBadge;
  const UploadIcon = icons.file;
  const PathIcon = icons.hash;
  const TtlIcon = icons.clock;
  const convertMeta = {
    none: { icon: icons.sparkles },
    md2html: { icon: icons.fileCode },
    qrcode: { icon: icons.qrcode },
    html: { icon: icons.fileBadge },
    url: { icon: icons.link },
    text: { icon: icons.text },
  };
  const CurrentConvertIcon = convertMeta[composer.form.convert]?.icon || icons.sparkles;
  const PATH_PATTERN = '[A-Za-z0-9_.\\-()/]{1,99}';

  function hasFiles(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  }

  useEffect(() => {
    function onWindowDragEnter(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current += 1;
      setGlobalDragging(true);
    }

    function onWindowDragOver(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setGlobalDragging(true);
    }

    function onWindowDragLeave(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
      if (globalDragDepthRef.current === 0) {
        setGlobalDragging(false);
        setDragging(false);
      }
    }

    function onWindowDrop(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      globalDragDepthRef.current = 0;
      setGlobalDragging(false);
      setDragging(false);
    }

    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, []);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function onDrop(event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    globalDragDepthRef.current = 0;
    setGlobalDragging(false);
    setDragging(false);
    composer.setFile(event.dataTransfer.files?.[0] || null);
  }

  function onPathChange(event) {
    const normalized = event.target.value.replace(/[^a-zA-Z0-9_.\-()/]/g, '').slice(0, 99);
    composer.setValue('path', normalized);
  }

  function onTtlChange(event) {
    const digits = event.target.value.replace(/\D/g, '');
    composer.setValue('ttl', digits);
  }

  return (
    <section className="panel-box composer-panel">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">New</div>
      <form className="grid gap-3 animate-fade-up" onSubmit={composer.submit}>
        <div
          className={`composer-shell ${globalDragging ? 'composer-shell-global-drag' : ''} ${dragging ? 'composer-shell-dragging' : ''}`}
          onDragEnter={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDragging(false);
          }}
          onDragOver={(event) => {
            if (!hasFiles(event)) return;
            event.preventDefault();
            setDragging(true);
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        >
          {composer.fileMeta ? (
            <div className="file-card group">
              <button className="btn btn-ghost btn-xs file-card-close" onClick={composer.reset} type="button">
                <CloseIcon className="size-4" strokeWidth={2.2} />
              </button>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-base-100 p-3 text-info shadow-sm">
                  <FileBadgeIcon className="size-5" strokeWidth={2.1} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{composer.fileMeta.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-base-content/60">
                    <span>{composer.fileMeta.type}</span>
                    <span>{composer.fileMeta.size}</span>
                    <span>File</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="composer-editor">
              <textarea
                className={`textarea textarea-ghost composer-textarea ${globalDragging ? 'composer-textarea-hidden' : ''}`}
                onChange={composer.set('url')}
                onKeyDown={composer.onShortcut}
                placeholder="Input text here or drag and drop file"
                value={composer.form.url}
              />
              <div className="tooltip tooltip-left composer-upload-wrap" data-tip="Upload file">
                <button className="btn btn-ghost btn-sm composer-upload" onClick={openPicker} type="button">
                  <UploadIcon className="size-4 opacity-60" strokeWidth={2.1} />
                </button>
              </div>
              {globalDragging && (
                <div className={`composer-drop-overlay ${dragging ? 'composer-drop-overlay-ready' : ''}`}>
                  <UploadIcon className="size-10" strokeWidth={2.1} />
                  <div className="composer-drop-title">Drop file here</div>
                  <div className="composer-drop-subtitle">{dragging ? 'Release to upload' : 'Move into the input area to upload'}</div>
                </div>
              )}
            </div>
          )}
          <input className="hidden" onChange={(e) => composer.setFile(e.target.files?.[0] || null)} ref={fileInputRef} type="file" />
        </div>
        <div className="toolbar-grid">
          <div className="field-shell field-shell-fixed input input-bordered">
            <PathIcon className="size-4 opacity-60" strokeWidth={2} />
            <input
              className="grow"
              maxLength={99}
              onChange={onPathChange}
              pattern={PATH_PATTERN}
              placeholder="custom/url/slug"
              title="1-99 chars: a-z A-Z 0-9 - _ . / ( )"
              value={composer.form.path}
            />
          </div>
          <div className="field-shell field-shell-fixed input input-bordered">
            <TtlIcon className="size-4 opacity-60" strokeWidth={2} />
            <input
              className="grow"
              inputMode="numeric"
              min={1}
              onChange={onTtlChange}
              pattern="[0-9]*"
              placeholder="1440"
              title="TTL in minutes, positive integer"
              type="text"
              value={composer.form.ttl}
            />
            <span className="opacity-55">mins</span>
          </div>
          {composer.file ? (
            <div className="field-shell field-shell-fixed input input-bordered">
              <FileBadgeIcon className="size-4 opacity-60" strokeWidth={2} />
              <input disabled value="file" />
            </div>
          ) : (
            <div className="select-shell">
              <CurrentConvertIcon className="select-shell-icon size-4 opacity-60" strokeWidth={2} />
              <select className="select select-bordered select-shell-input" onChange={composer.set('convert')} value={composer.form.convert}>
                <option value="none">auto type</option>
                <option value="md2html">md2html</option>
                <option value="qrcode">qrcode</option>
                <option value="html">html</option>
                <option value="url">url</option>
                <option value="text">text</option>
              </select>
            </div>
          )}
          <button className={`btn field-shell field-action field-action-button h-12 min-h-12 self-end rounded-[1.2rem] px-4 ${composer.canSubmit ? 'field-action-active' : 'field-action-inactive'}`} disabled={!composer.canSubmit} type="submit">
            <icons.send className="size-4" strokeWidth={2.2} />
            <span>Post</span>
          </button>
        </div>
      </form>
    </section>
  );
}
