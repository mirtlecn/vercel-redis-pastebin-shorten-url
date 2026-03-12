import { useState } from 'react';
import { apiRequest, uploadFile } from '../lib/api.js';

const initial = { convert: 'none', path: '', ttl: '', url: '' };

function getFileMeta(file) {
  if (!file) return null;
  const size = file.size < 1024 * 1024
    ? `${Math.max(1, Math.round(file.size / 102.4) / 10)} KB`
    : `${Math.round(file.size / 1024 / 102.4) / 10} MB`;
  return {
    name: file.name,
    size,
    type: file.type || (file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : 'FILE'),
  };
}

export function useComposer({ notify, onCreated, token }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  const setValue = (key, value) => setForm((v) => ({ ...v, [key]: value }));

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
    const payload = await uploadFile(token, data);
    notify('success', 'Uploaded');
    return payload;
  }

  async function submitText() {
    if (!form.url.trim()) throw new Error('Content is required');
    const body = { url: form.url.trim() };
    if (form.path.trim()) body.path = form.path.trim();
    if (form.ttl.trim()) body.ttl = Number(form.ttl.trim());
    if (form.convert !== 'none') body.convert = form.convert;
    const payload = await apiRequest(token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify('success', 'Created');
    return payload;
  }

  function reset() {
    setFile(null);
    setForm(initial);
  }

  function onShortcut(event) {
    if (event.key !== 'Enter' || !event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!canSubmit) return;
    submit(event);
  }

  const fileMeta = getFileMeta(file);
  const canSubmit = Boolean(file || form.url.trim()) && !busy;

  return { busy, canSubmit, file, fileMeta, form, onShortcut, reset, set, setFile, setValue, submit };
}
