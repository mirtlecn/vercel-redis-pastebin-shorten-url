import { useEffect, useMemo, useState } from 'react';
import { apiRequest, uploadFile } from '../lib/api.js';
import {
  buildFileUploadData,
  buildInitialForm,
  buildRestoredForm,
  buildTextRequestBody,
  buildTopicModeForm,
  canSubmitComposerForm,
  isTopicCreateType,
  normalizePathValue,
  normalizeTopicNameValue,
  normalizeTtlValue,
} from '../lib/composer-mode.js';

function getFileMeta(file) {
  if (!file) return null;
  const size = file.size < 1024 * 1024
    ? `${Math.max(1, Math.round(file.size / 102.4) / 10)} KB`
    : `${Math.round(file.size / 1024 / 102.4) / 10} MB`;
  return {
    name: file.name,
    size,
  };
}

export function useComposer({ notify, onCreated, selectedTopicPath = '', topics = [] }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(buildInitialForm(selectedTopicPath));
  const isTopicMode = isTopicCreateType(form.convert);
  const updateFormValue = (fieldName, fieldValue) =>
    setForm((currentForm) => ({ ...currentForm, [fieldName]: fieldValue }));

  useEffect(() => {
    setForm((currentForm) => {
      if (isTopicCreateType(currentForm.convert)) {
        return currentForm.topic === '' ? currentForm : { ...currentForm, topic: '' };
      }

      return currentForm.topic === selectedTopicPath
        ? currentForm
        : { ...currentForm, topic: selectedTopicPath, path: '' };
    });
  }, [selectedTopicPath]);

  async function submit(event, { resetForm } = {}) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = file ? await submitFile() : await submitText();
      await onCreated(payload);
      reset(resetForm);
      return true;
    } catch (error) {
      notify('error', error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitFile() {
    const data = buildFileUploadData(form, file);
    const payload = await uploadFile(data);
    notify('success', 'Uploaded');
    return payload;
  }

  async function submitText() {
    if (!form.content.trim()) throw new Error('Content is required');
    const body = buildTextRequestBody(form);
    const payload = await apiRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify('success', 'Created');
    return payload;
  }

  function updatePath(value) {
    updateFormValue('path', normalizePathValue(value));
  }

  function updateTitle(value) {
    updateFormValue('title', value.slice(0, 120));
  }

  function updateCreatedDate(value) {
    updateFormValue('createdDate', value.slice(0, 10));
    if (!value) updateFormValue('createdTime', '');
  }

  function updateCreatedTime(value) {
    updateFormValue('createdTime', value.slice(0, 5));
  }

  function updateContent(value) {
    updateFormValue('content', isTopicCreateType(form.convert) ? normalizeTopicNameValue(value) : value);
  }

  function updateTtl(value) {
    updateFormValue('ttl', normalizeTtlValue(value));
  }

  function updateTopic(value) {
    updateFormValue('topic', value);
    updateFormValue('path', '');
  }

  function reset(nextForm) {
    setFile(null);
    setForm(nextForm ? buildRestoredForm(nextForm, selectedTopicPath) : buildInitialForm(selectedTopicPath));
  }

  function enterTopicMode() {
    setFile(null);
    setForm(buildTopicModeForm());
  }

  function restoreForm(snapshot) {
    setFile(null);
    setForm(buildRestoredForm(snapshot, selectedTopicPath));
  }

  function onShortcut(event) {
    if (isTopicCreateType(form.convert) && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Enter' || !event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!canSubmit) return;
    submit(event);
  }

  const fileMeta = getFileMeta(file);
  const selectedTopic = useMemo(
    () => topics.find((item) => item.path === form.topic) || null,
    [form.topic, topics],
  );
  const canSubmit = canSubmitComposerForm({ busy, file, form });

  return {
    busy,
    canSubmit,
    enterTopicMode,
    file,
    fileMeta,
    form,
    isTopicMode,
    selectedTopic,
    onShortcut,
    reset,
    restoreForm,
    setFile,
    submit,
    updatePath,
    updateTitle,
    updateTopic,
    updateContent,
    updateFormValue,
    updateCreatedDate,
    updateCreatedTime,
    updateTtl,
  };
}
