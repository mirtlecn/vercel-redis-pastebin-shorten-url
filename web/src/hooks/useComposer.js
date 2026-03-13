import { useState } from 'react';
import { apiRequest, uploadFile } from '../lib/api.js';

const INITIAL_FORM = { convert: 'none', path: '', ttl: '', url: '' };

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

export function useComposer({ notify, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const createFieldChangeHandler = (fieldName) => (event) =>
    setForm((currentForm) => ({ ...currentForm, [fieldName]: event.target.value }));
  const updateFormValue = (fieldName, fieldValue) =>
    setForm((currentForm) => ({ ...currentForm, [fieldName]: fieldValue }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = file ? await submitFile() : await submitText();
      onCreated(payload);
      reset();
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitFile() {
    const data = new FormData();
    data.append('file', file);
    if (form.path.trim()) data.append('path', form.path.trim());
    if (form.ttl.trim()) data.append('ttl', form.ttl.trim());
    const payload = await uploadFile(data);
    notify('success', 'Uploaded');
    return payload;
  }

  async function submitText() {
    if (!form.url.trim()) throw new Error('Content is required');
    const body = { url: form.url.trim() };
    if (form.path.trim()) body.path = form.path.trim();
    if (form.ttl.trim()) body.ttl = Number(form.ttl.trim());
    if (form.convert !== 'none') body.convert = form.convert;
    const payload = await apiRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify('success', 'Created');
    return payload;
  }

  function reset() {
    setFile(null);
    setForm(INITIAL_FORM);
  }

  function onShortcut(event) {
    if (event.key !== 'Enter' || !event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!canSubmit) return;
    submit(event);
  }

  const fileMeta = getFileMeta(file);
  const canSubmit = Boolean(file || form.url.trim()) && !busy;

  return {
    busy,
    canSubmit,
    createFieldChangeHandler,
    file,
    fileMeta,
    form,
    onShortcut,
    reset,
    setFile,
    submit,
    updateFormValue,
  };
}
