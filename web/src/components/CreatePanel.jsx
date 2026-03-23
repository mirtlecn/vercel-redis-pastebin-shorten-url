import { useEffect, useRef, useState } from 'react';
import { ComposerEditor } from './ComposerEditor.jsx';
import { ComposerMetaFields } from './ComposerMetaFields.jsx';
import { ComposerToolbar } from './ComposerToolbar.jsx';
import { useComposer } from '../hooks/useComposer.js';
import { useComposerDragAndPaste } from '../hooks/useComposerDragAndPaste.js';
import { useComposerMenu } from '../hooks/useComposerMenu.js';
import { useTopicModeRestore } from '../hooks/useTopicModeRestore.js';
import { formatTopicLabel, getComposerUiState } from '../lib/composer-mode.js';

export function CreatePanel(props) {
  const composer = useComposer(props);
  const [topicOpen, setTopicOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(() => Boolean(props.initialMetaOpen));
  const [ttlFocused, setTtlFocused] = useState(false);
  const topicRef = useRef(null);
  const createdDateRef = useRef(null);
  const createdTimeRef = useRef(null);
  const menu = useComposerMenu();
  const dragAndPaste = useComposerDragAndPaste({
    disabled: composer.isTopicMode,
    onSelectFile: composer.setFile,
  });
  const topicMode = useTopicModeRestore({
    clearNativeFileInput: dragAndPaste.clearSelectedFile,
    composer,
    metaOpen,
    setMetaOpen,
  });
  const topicPrefixLabel = composer.isTopicMode
    ? '/'
    : formatTopicLabel(composer.selectedTopic?.path || '');
  const topicPrefixLabelBody = topicPrefixLabel === '/' ? '' : topicPrefixLabel.slice(0, -1);
  const uiState = getComposerUiState({
    form: composer.form,
    selectedTopic: composer.selectedTopic,
    globalDragging: dragAndPaste.globalDragging,
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
    if (!composer.isTopicMode) return;
    setTtlFocused(false);
  }, [composer.isTopicMode]);

  useEffect(() => {
    if (!ttlDisabled) return;
    setTtlFocused(false);
  }, [ttlDisabled]);

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
    dragAndPaste.clearSelectedFile();
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
    await topicMode.submit(event);
  }

  return (
    <section className="panel-box composer-panel">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-content/55">New</div>
      <form className="grid gap-3 animate-fade-up" onSubmit={onSubmit}>
        <ComposerEditor
          contentValue={composer.form.content}
          dragging={dragAndPaste.dragging}
          editorPlaceholder={editorPlaceholder}
          fileInputRef={dragAndPaste.fileInputRef}
          fileMeta={composer.fileMeta}
          globalDragging={dragAndPaste.globalDragging}
          isTopicMode={composer.isTopicMode}
          metaFields={(
            <ComposerMetaFields
              createdDateRef={createdDateRef}
              createdDateValue={composer.form.createdDate}
              createdTimeRef={createdTimeRef}
              createdTimeValue={composer.form.createdTime}
              metaVisible={metaVisible}
              onCreatedDateChange={composer.updateCreatedDate}
              onCreatedTimeChange={composer.updateCreatedTime}
              onOpenCreatedPicker={openCreatedPicker}
              onTitleChange={composer.updateTitle}
              onToggleMeta={() => setMetaOpen((value) => !value)}
              showMetaToggle={showMetaToggle}
              titleValue={composer.form.title}
            />
          )}
          metaVisible={metaVisible}
          onClearSelectedFile={clearSelectedFile}
          onContentChange={composer.updateContent}
          onDragEnter={dragAndPaste.onDragEnter}
          onDragLeave={dragAndPaste.onDragLeave}
          onDragOver={dragAndPaste.onDragOver}
          onDrop={dragAndPaste.onDrop}
          onFileInputChange={dragAndPaste.onFileInputChange}
          onOpenPicker={dragAndPaste.openPicker}
          onPaste={dragAndPaste.onPaste}
          onShortcut={composer.onShortcut}
          textareaRef={dragAndPaste.textareaRef}
        />
        <ComposerToolbar
          busy={composer.busy}
          canSubmit={composer.canSubmit}
          effectiveTtlPlaceholder={effectiveTtlPlaceholder}
          effectiveTtlSuffixVisible={effectiveTtlSuffixVisible}
          file={composer.file}
          form={composer.form}
          isTopicMode={composer.isTopicMode}
          menuButtonRef={menu.menuButtonRef}
          menuOpen={menu.menuOpen}
          menuPanelRef={menu.menuPanelRef}
          menuPosition={menu.menuPosition}
          menuRef={menu.menuRef}
          onConvertSelect={(nextConvert) => topicMode.onConvertSelect(nextConvert, () => menu.setMenuOpen(false))}
          onPathChange={composer.updatePath}
          onTopicBlur={() => setTopicOpen(false)}
          onTopicChange={onTopicChange}
          onTopicFocus={() => setTopicOpen(true)}
          onTopicPointerDown={() => setTopicOpen(true)}
          onTtlBlur={() => setTtlFocused(false)}
          onTtlChange={composer.updateTtl}
          onTtlFocus={() => setTtlFocused(true)}
          pathInputVisible={pathInputVisible}
          pathPlaceholder={pathPlaceholder}
          selectedTopicLabel={topicPrefixLabelBody}
          setMenuOpen={menu.setMenuOpen}
          topicOpen={topicOpen}
          topicPrefix={topicPrefix}
          topicRef={topicRef}
          topics={props.topics}
          ttlDisabled={ttlDisabled}
        />
      </form>
    </section>
  );
}
