import { icons } from '../icons/Icons.jsx';

export function ComposerEditor({
  contentValue,
  dragging,
  editorPlaceholder,
  fileInputRef,
  fileMeta,
  globalDragging,
  isTopicMode,
  metaFields,
  metaVisible,
  onClearSelectedFile,
  onContentChange,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileInputChange,
  onOpenPicker,
  onPaste,
  onShortcut,
  textareaRef,
}) {
  const CloseIcon = icons.close;
  const FileBadgeIcon = icons.fileBadge;
  const UploadIcon = icons.file;

  return (
    <div
      className={`composer-shell ${globalDragging ? 'composer-shell-global-drag' : ''} ${dragging ? 'composer-shell-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {metaFields}
      {fileMeta ? (
        <div className={`composer-file-stage ${metaVisible ? 'composer-file-stage-with-meta' : ''}`}>
          <div className="file-card">
            <div className="file-card-content">
              <div className="tooltip tooltip-top tooltip-layer" data-tip="Remove">
                <button className="file-card-icon-button" onClick={onClearSelectedFile} type="button">
                  <FileBadgeIcon className="file-card-icon file-card-icon-file size-5" strokeWidth={2.1} />
                  <CloseIcon className="file-card-icon file-card-icon-remove size-5" strokeWidth={2.1} />
                </button>
              </div>
              <div className="file-card-details">
                <div className="file-card-name text-lg font-semibold">{fileMeta.name}</div>
                <div className="file-card-meta mt-2 text-sm text-base-content/60">
                  <span>{fileMeta.size}</span>
                  <span>File</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`composer-editor ${metaVisible ? 'composer-editor-with-meta' : ''}`}>
          <textarea
            className={`textarea textarea-ghost composer-textarea ${metaVisible ? 'composer-textarea-with-meta' : 'composer-textarea-with-meta-icon'} ${globalDragging ? 'composer-textarea-hidden' : ''}`}
            onChange={(event) => onContentChange(event.target.value)}
            onKeyDown={onShortcut}
            onPaste={onPaste}
            placeholder={editorPlaceholder}
            ref={textareaRef}
            value={contentValue}
          />
          {!isTopicMode && !contentValue.trim() && !globalDragging ? (
            <div className={`composer-hint ${metaVisible ? 'composer-hint-shifted' : ''}`}>
              <span>Input texts or </span>
              <button className="composer-hint-upload" onClick={onOpenPicker} type="button">
                upload a file
              </button>
            </div>
          ) : null}
          {globalDragging && !isTopicMode ? (
            <div className={`composer-drop-overlay ${dragging ? 'composer-drop-overlay-ready' : ''}`}>
              <UploadIcon className="size-10" strokeWidth={2.1} />
              <div className="composer-drop-title">Drop file here</div>
              <div className="composer-drop-subtitle">{dragging ? 'Release to upload' : 'Move into the input area to upload'}</div>
            </div>
          ) : null}
        </div>
      )}
      <input className="hidden" onChange={onFileInputChange} ref={fileInputRef} type="file" />
    </div>
  );
}
