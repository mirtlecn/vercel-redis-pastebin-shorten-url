import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { icons } from '../icons/Icons.jsx';
import { useComposer } from '../hooks/useComposer.js';
import { formatTopicLabel, getComposerUiState, TOPIC_CREATE_TYPE } from '../lib/composer-mode.js';
import { getImageFileFromClipboard } from '../lib/clipboard.js';
import { computeSelectMenuPosition } from '../lib/select-menu-position.js';

const PATH_PATTERN = '[A-Za-z0-9_.\\/\\(\\)\\-]{1,99}';
const CONVERT_OPTIONS = [
  { value: 'none', label: 'auto type', icon: icons.sparkles },
  { value: 'md2html', label: 'md2html', icon: icons.fileCode },
  { value: 'qrcode', label: 'qrcode', icon: icons.qrcode },
  { value: 'html', label: 'html', icon: icons.fileBadge },
  { value: 'url', label: 'url', icon: icons.link },
  { value: 'text', label: 'text', icon: icons.text },
  { value: TOPIC_CREATE_TYPE, label: 'topic', icon: icons.folderTree, separated: true },
];

function hasFiles(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
}

function getConvertMeta(value) {
  return CONVERT_OPTIONS.find((option) => option.value === value) || CONVERT_OPTIONS[0];
}

export function CreatePanel(props) {
  const composer = useComposer(props);
  const [globalDragging, setGlobalDragging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(() => Boolean(props.initialMetaOpen));
  const [ttlFocused, setTtlFocused] = useState(false);
  const [topicModeSnapshot, setTopicModeSnapshot] = useState(null);
  const globalDragDepthRef = useRef(0);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);
  const syncMenuPositionRef = useRef(() => {});
  const topicRef = useRef(null);
  const textareaRef = useRef(null);
  const createdDateRef = useRef(null);
  const createdTimeRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const CloseIcon = icons.close;
  const FileBadgeIcon = icons.fileBadge;
  const UploadIcon = icons.file;
  const BusyIcon = icons.refresh;
  const TtlIcon = icons.clock;
  const CaretIcon = icons.chevronDown;
  const TitleIcon = icons.title;
  const TitleCollapseIcon = icons.titleCollapse;
  const currentConvertMeta = getConvertMeta(composer.form.convert);
  const CurrentConvertIcon = currentConvertMeta.icon;
  const topicPrefixLabel = composer.isTopicMode
    ? '/'
    : formatTopicLabel(composer.selectedTopic?.path || '');
  const topicPrefixLabelBody = topicPrefixLabel === '/' ? '' : topicPrefixLabel.slice(0, -1);
  const uiState = getComposerUiState({
    form: composer.form,
    selectedTopic: composer.selectedTopic,
    globalDragging,
    metaOpen,
  });
  const {
    editorPlaceholder,
    pathInputVisible,
    pathPlaceholder,
    showMetaToggle,
    metaVisible,
    topicPrefix,
    ttlDisabled,
    ttlPlaceholder,
    ttlSuffixVisible,
  } = uiState;
  const effectiveTtlPlaceholder = ttlFocused ? '' : ttlPlaceholder;
  const effectiveTtlSuffixVisible = ttlFocused || ttlSuffixVisible;

  useEffect(() => {
    props.onModeChange?.(composer.form.convert);
  }, [composer.form.convert, props.onModeChange]);

  useEffect(() => {
    function onWindowDragEnter(event) {
      if (!hasFiles(event) || composer.isTopicMode) return;
      event.preventDefault();
      globalDragDepthRef.current += 1;
      setGlobalDragging(true);
    }

    function onWindowDragOver(event) {
      if (!hasFiles(event) || composer.isTopicMode) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setGlobalDragging(true);
    }

    function onWindowDragLeave(event) {
      if (!hasFiles(event) || composer.isTopicMode) return;
      event.preventDefault();
      globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
      if (globalDragDepthRef.current === 0) {
        setGlobalDragging(false);
        setDragging(false);
      }
    }

    function onWindowDrop(event) {
      if (!hasFiles(event) || composer.isTopicMode) return;
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
  }, [composer.isTopicMode]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!composer.isTopicMode) return;
    setTtlFocused(false);
  }, [composer.isTopicMode]);

  useEffect(() => {
    if (!ttlDisabled) return;
    setTtlFocused(false);
  }, [ttlDisabled]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function onPointerDown(event) {
      const target = event.target;
      if (target instanceof Element && (menuRef.current?.contains(target) || menuPanelRef.current?.contains(target))) return;
      setMenuOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return undefined;
    }

    function syncMenuPosition() {
      const button = menuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const nextMenuPosition = computeSelectMenuPosition({
        rect,
        menuHeight: menuPanelRef.current?.offsetHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setMenuPosition(nextMenuPosition);
    }

    syncMenuPositionRef.current = syncMenuPosition;
    syncMenuPosition();
    window.addEventListener('resize', syncMenuPosition);
    window.addEventListener('scroll', syncMenuPosition, true);
    return () => {
      syncMenuPositionRef.current = () => {};
      window.removeEventListener('resize', syncMenuPosition);
      window.removeEventListener('scroll', syncMenuPosition, true);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      syncMenuPositionRef.current();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  function setSelectedFile(file) {
    composer.setFile(file);
  }

  function openNativePicker(input) {
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  }

  function openCreatedPicker(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (createdTimeRef.current && createdTimeRef.current.contains?.(target)) {
      openNativePicker(createdTimeRef.current);
      return;
    }
    if (createdDateRef.current && createdDateRef.current.contains?.(target)) {
      openNativePicker(createdDateRef.current);
      return;
    }
    if (!composer.form.createdDate) {
      openNativePicker(createdDateRef.current);
      return;
    }
    openNativePicker(createdTimeRef.current || createdDateRef.current);
  }

  function clearSelectedFile() {
    composer.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function openPicker() {
    if (composer.isTopicMode) return;
    fileInputRef.current?.click();
  }

  function onDrop(event) {
    if (!hasFiles(event) || composer.isTopicMode) return;
    event.preventDefault();
    globalDragDepthRef.current = 0;
    setGlobalDragging(false);
    setDragging(false);
    setSelectedFile(event.dataTransfer.files?.[0] || null);
  }

  function onPaste(event) {
    if (composer.isTopicMode) return;

    const imageFile = getImageFileFromClipboard(event.clipboardData);
    if (!imageFile) return;

    event.preventDefault();
    setSelectedFile(imageFile);
  }

  function restoreAfterTopicMode(nextConvert = null) {
    const snapshot = topicModeSnapshot;
    composer.restoreForm(snapshot);
    setMetaOpen(snapshot?.metaOpen ?? false);
    setTopicModeSnapshot(null);
    if (nextConvert) composer.updateFormValue('convert', nextConvert);
  }

  function onConvertSelect(nextConvert) {
    setMenuOpen(false);

    if (nextConvert === TOPIC_CREATE_TYPE) {
      if (!composer.isTopicMode) {
        setTopicModeSnapshot({
          ...composer.form,
          metaOpen,
        });
      }
      composer.enterTopicMode();
      setMetaOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (composer.isTopicMode) {
      restoreAfterTopicMode(nextConvert);
      return;
    }

    composer.updateFormValue('convert', nextConvert);
  }

  function onTopicChange(event) {
    if (composer.isTopicMode) return;

    const nextTopicPath = event.target.value;
    if (nextTopicPath) setMetaOpen(true);
    composer.updateTopic(nextTopicPath);
    props.onTopicChange?.(nextTopicPath);
    requestAnimationFrame(() => {
      setTopicOpen(false);
      const select = topicRef.current;
      if (select && document.activeElement === select) select.blur();
    });
  }

  async function onSubmit(event) {
    const submittedInTopicMode = composer.isTopicMode;
    const didSubmit = await composer.submit(event, {
      resetForm: submittedInTopicMode ? topicModeSnapshot : undefined,
    });

    if (!didSubmit || !submittedInTopicMode) return;

    setMetaOpen(topicModeSnapshot?.metaOpen ?? false);
    setTopicModeSnapshot(null);
  }

  return (
    <section className="panel-box composer-panel">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">New</div>
      <form className="grid gap-3 animate-fade-up" onSubmit={onSubmit}>
        <div
          className={`composer-shell ${globalDragging ? 'composer-shell-global-drag' : ''} ${dragging ? 'composer-shell-dragging' : ''}`}
          onDragEnter={(event) => {
            if (!hasFiles(event) || composer.isTopicMode) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!hasFiles(event) || composer.isTopicMode) return;
            event.preventDefault();
            setDragging(false);
          }}
          onDragOver={(event) => {
            if (!hasFiles(event) || composer.isTopicMode) return;
            event.preventDefault();
            setDragging(true);
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        >
          <div className={`composer-meta-row ${metaVisible ? 'composer-meta-row-open' : ''} ${showMetaToggle ? '' : 'composer-meta-row-hidden'}`}>
            {metaVisible ? (
              <>
                <div className="composer-meta-field composer-meta-field-title">
                  <span className="composer-meta-label">Title:</span>
                  <input
                    className="input input-ghost composer-meta-inline-input"
                    maxLength={120}
                    onChange={(event) => composer.updateTitle(event.target.value)}
                    placeholder=""
                    value={composer.form.title}
                  />
                </div>
                <div
                  className="composer-meta-field composer-meta-field-created"
                  onClick={openCreatedPicker}
                >
                  <span className="composer-meta-label">Created:</span>
                  <div className={`composer-created-inputs ${composer.form.createdDate ? '' : 'composer-created-inputs-empty'}`}>
                    <input
                      className="input input-ghost composer-created-input composer-created-date"
                      ref={createdDateRef}
                      onChange={(event) => composer.updateCreatedDate(event.target.value)}
                      type="date"
                      value={composer.form.createdDate}
                    />
                    {composer.form.createdDate ? (
                      <input
                        className="input input-ghost composer-created-input composer-created-time"
                        ref={createdTimeRef}
                        onChange={(event) => composer.updateCreatedTime(event.target.value)}
                        step={60}
                        type="time"
                        value={composer.form.createdTime}
                      />
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {showMetaToggle ? (
            <div className="tooltip tooltip-left tooltip-layer composer-meta-tooltip" data-tip={metaVisible ? 'Hide' : 'Add meta info'}>
              <button
                className={`btn btn-ghost btn-xs composer-meta-icon ${metaVisible ? 'composer-meta-icon-open' : ''}`}
                onClick={() => {
                  if (metaVisible) {
                    setMetaOpen(false);
                    return;
                  }
                  setMetaOpen(true);
                }}
                type="button"
              >
                {metaVisible ? <TitleCollapseIcon className="size-[0.95rem]" strokeWidth={1.9} /> : <TitleIcon className="size-[0.95rem]" strokeWidth={1.9} />}
              </button>
            </div>
          ) : null}
          {composer.fileMeta ? (
            <div className={`composer-file-stage ${metaVisible ? 'composer-file-stage-with-meta' : ''}`}>
              <div className="file-card">
                <div className="file-card-content">
                  <div className="tooltip tooltip-top tooltip-layer" data-tip="Remove">
                    <button className="file-card-icon-button" onClick={clearSelectedFile} type="button">
                      <FileBadgeIcon className="file-card-icon file-card-icon-file size-5" strokeWidth={2.1} />
                      <CloseIcon className="file-card-icon file-card-icon-remove size-5" strokeWidth={2.1} />
                    </button>
                  </div>
                  <div className="file-card-details">
                    <div className="file-card-name text-lg font-semibold">{composer.fileMeta.name}</div>
                    <div className="file-card-meta mt-2 text-sm text-base-content/60">
                      <span>{composer.fileMeta.size}</span>
                      <span>File</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`composer-editor ${metaVisible ? 'composer-editor-with-meta' : ''}`}>
              <textarea
                ref={textareaRef}
                className={`textarea textarea-ghost composer-textarea ${metaVisible ? 'composer-textarea-with-meta' : 'composer-textarea-with-meta-icon'} ${globalDragging ? 'composer-textarea-hidden' : ''}`}
                onChange={(event) => composer.updateContent(event.target.value)}
                onKeyDown={composer.onShortcut}
                onPaste={onPaste}
                placeholder={editorPlaceholder}
                value={composer.form.content}
              />
              {!composer.isTopicMode && !composer.form.content.trim() && !globalDragging && (
                <div className={`composer-hint ${metaVisible ? 'composer-hint-shifted' : ''}`}>
                  <span>Input texts or </span>
                  <button className="composer-hint-upload" onClick={openPicker} type="button">
                    upload a file
                  </button>
                </div>
              )}
              {globalDragging && !composer.isTopicMode && (
                <div className={`composer-drop-overlay ${dragging ? 'composer-drop-overlay-ready' : ''}`}>
                  <UploadIcon className="size-10" strokeWidth={2.1} />
                  <div className="composer-drop-title">Drop file here</div>
                  <div className="composer-drop-subtitle">{dragging ? 'Release to upload' : 'Move into the input area to upload'}</div>
                </div>
              )}
            </div>
          )}
          <input className="hidden" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} ref={fileInputRef} type="file" />
        </div>
        <div className="toolbar-grid">
          <div className="field-shell field-shell-fixed input input-bordered">
            <div
              aria-disabled={composer.isTopicMode}
              className={`path-prefix-shell ${topicOpen ? 'path-prefix-shell-open' : ''} ${composer.isTopicMode ? 'path-prefix-shell-disabled' : ''}`}
            >
              {topicPrefix ? (
                <span className="path-prefix-label" aria-hidden="true" title={topicPrefix}>
                  <span className="path-prefix-label-text">{topicPrefixLabelBody}</span>
                  <span className="path-prefix-label-slash">/</span>
                </span>
              ) : null}
              {composer.isTopicMode ? null : (
                <select
                  ref={topicRef}
                  className="select path-prefix-select"
                  onBlur={() => setTopicOpen(false)}
                  onChange={onTopicChange}
                  onFocus={() => setTopicOpen(true)}
                  onPointerDown={() => setTopicOpen(true)}
                  value={composer.form.topic}
                >
                  <option value="">/</option>
                  {props.topics.map((topic) => (
                    <option key={topic.path} title={`${topic.path}/`} value={topic.path}>
                      {formatTopicLabel(topic.path)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {pathInputVisible ? (
              <input
                className="grow path-input"
                maxLength={99}
                onChange={(event) => composer.updatePath(event.target.value)}
                pattern={PATH_PATTERN}
                placeholder={pathPlaceholder}
                title="1-99 chars: a-z A-Z 0-9 - _ . / ( )"
                value={composer.form.path}
              />
            ) : (
              <input
                aria-hidden="true"
                className="grow path-input path-input-disabled"
                disabled
                readOnly
                tabIndex={-1}
                value=""
              />
            )}
          </div>
          <div className="field-shell field-shell-fixed input input-bordered">
            <TtlIcon className="size-4 shrink-0 opacity-60" strokeWidth={2} />
            <input
              className="grow"
              disabled={ttlDisabled}
              onBlur={() => setTtlFocused(false)}
              onFocus={() => setTtlFocused(true)}
              inputMode="numeric"
              min={0}
              onChange={(event) => composer.updateTtl(event.target.value)}
              pattern="[0-9]*"
              placeholder={effectiveTtlPlaceholder}
              title="Leave empty to never expire"
              type="text"
              value={composer.form.ttl}
            />
            {effectiveTtlSuffixVisible ? <span className="opacity-55">mins</span> : null}
          </div>
          {composer.file ? (
            <div className="field-shell field-shell-fixed input input-bordered">
              <FileBadgeIcon className="size-4 opacity-60" strokeWidth={2} />
              <input disabled value="file" />
            </div>
          ) : (
            <div className={`select-shell ${menuOpen ? 'select-shell-open' : ''}`} ref={menuRef}>
              <CurrentConvertIcon className="select-shell-icon size-4 opacity-60" strokeWidth={2} />
              <CaretIcon className="select-shell-caret size-4" strokeWidth={2.2} />
              <button
                aria-expanded={menuOpen}
                aria-haspopup="listbox"
                className="select select-bordered select-shell-input select-shell-button"
                ref={menuButtonRef}
                onClick={() => setMenuOpen((value) => !value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenuOpen(false);
                  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setMenuOpen(true);
                  }
                }}
                type="button"
              >
                <span>{currentConvertMeta.label}</span>
              </button>
              {menuOpen ? createPortal(
                <div
                  className="select-menu"
                  ref={menuPanelRef}
                  role="listbox"
                  style={{
                    left: `${menuPosition?.left ?? -9999}px`,
                    top: `${menuPosition?.top ?? -9999}px`,
                    width: `${menuPosition?.width ?? menuButtonRef.current?.offsetWidth ?? 0}px`,
                    visibility: menuPosition ? 'visible' : 'hidden',
                  }}
                >
                  {CONVERT_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    const isSelected = option.value === composer.form.convert;
                    return (
                      <div
                        className={option.separated ? 'select-menu-group select-menu-group-separated' : 'select-menu-group'}
                        key={option.value}
                      >
                        <button
                          aria-selected={isSelected}
                          className={`select-menu-item ${isSelected ? 'select-menu-item-active' : ''}`}
                          onClick={() => onConvertSelect(option.value)}
                          role="option"
                          type="button"
                        >
                          <span className="select-menu-item-check" aria-hidden="true">
                            {isSelected ? <icons.check className="size-4" strokeWidth={2.3} /> : null}
                          </span>
                          <OptionIcon className="size-4 select-menu-item-icon" strokeWidth={2} />
                          <span>{option.label}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>,
                document.body,
              ) : null}
            </div>
          )}
          <button className={`btn field-shell field-action field-action-button h-12 min-h-12 self-end rounded-[1.2rem] px-4 ${composer.canSubmit ? 'field-action-active' : 'field-action-inactive'}`} disabled={!composer.canSubmit} type="submit">
            {composer.busy ? <BusyIcon className="size-4 animate-spin" strokeWidth={2.2} /> : <icons.send className="size-4" strokeWidth={2.2} />}
            <span>Post</span>
          </button>
        </div>
      </form>
    </section>
  );
}
