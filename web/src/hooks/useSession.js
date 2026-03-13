import { useCallback, useEffect, useState } from 'react';
import { sessionRequest } from '../lib/api.js';

export function useSession() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [booting, setBooting] = useState(true);

  const clearSession = useCallback(() => {
    setAuthenticated(false);
    setPassword('');
    setError('');
  }, []);

  const logout = useCallback(async () => {
    try {
      await sessionRequest({ method: 'DELETE' });
    } catch {
      // Keep the local UI consistent even if logout fails on the server.
    }
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;
    sessionRequest()
      .then(() => {
        if (!cancelled) setAuthenticated(true);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (event) => {
    event.preventDefault();
    const nextPassword = password.trim();
    if (!nextPassword) return;
    setIsBusy(true);
    setError('');
    try {
      await sessionRequest({ method: 'POST', body: JSON.stringify({ password: nextPassword }) });
      setAuthenticated(true);
      setPassword('');
    } catch {
      setError('Wrong key');
    } finally {
      setIsBusy(false);
    }
  }, [password]);

  return { authenticated, booting, error, isBusy, login, logout, password, setPassword };
}
