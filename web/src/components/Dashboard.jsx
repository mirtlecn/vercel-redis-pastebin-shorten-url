import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { sortItems } from '../config.js';
import { icons } from '../icons/Icons.jsx';
import { useToast } from '../hooks/useToast.js';
import { CreatePanel } from './CreatePanel.jsx';
import { IconButton } from './IconButton.jsx';
import { ListPanel } from './ListPanel.jsx';
import { ResultPanel } from './ResultPanel.jsx';
import { ToastLayer } from './ToastLayer.jsx';

export function Dashboard({ onLogout, token }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  async function loadItems() {
    try {
      setItems(sortItems(await apiRequest(token)));
    } catch (error) {
      showToast('error', error.message);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function remove(path) {
    try {
      await apiRequest(token, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      setItems((v) => v.filter((item) => item.path !== path));
      showToast('success', 'Deleted');
    } catch (error) {
      showToast('error', error.message);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Copied');
    } catch {
      showToast('error', 'Copy failed');
    }
  }

  async function created(payload) {
    setResult(payload);
    setPage(1);
    await loadItems();
  }

  async function refreshPage() {
    setPage(1);
    await loadItems();
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-6">
      <header className="panel-box mb-6 flex items-center justify-between">
        <button className="dashboard-title text-5xl font-black" onClick={refreshPage} type="button">
          Post
        </button>
        <div className="flex gap-2">
          <IconButton icon={icons.logout} onClick={onLogout} title="Logout" />
        </div>
      </header>
      <CreatePanel notify={showToast} onCreated={created} token={token} />
      <div className="my-6">
        <ResultPanel onCopy={copy} result={result} />
      </div>
      {items.length > 0 && <ListPanel items={items} onCopy={copy} onDelete={remove} page={page} setPage={setPage} />}
      <ToastLayer onClose={clearToast} toast={toast} />
    </section>
  );
}
