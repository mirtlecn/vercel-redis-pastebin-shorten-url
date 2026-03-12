import { icons } from '../icons/Icons.jsx';

export function LoginView({ password, onChange, onSubmit, isBusy, error }) {
  const SendIcon = icons.send;

  return (
    <section className="login-wrap">
      <div className="login-frame animate-fade-up">
        <div className="login-orb login-orb-a" />
        <div className="login-orb login-orb-b" />
        <div className="login-card">
          <div className="login-grid">
            <div className="login-brand">
              <div className="login-badge" />
              <h1 className="login-title">Post</h1>
              <p className="login-subtitle">Lightweight file, text &amp; URL sharing service</p>
            </div>
            <form className={error ? 'animate-shake-soft' : ''} onSubmit={onSubmit}>
              <label className={`input input-lg login-input ${error ? 'login-input-error' : ''}`}>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  className="grow masked-input"
                  inputMode="text"
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="Enter password"
                  spellCheck={false}
                  type="text"
                  value={password}
                />
                <button className="btn btn-neutral btn-square btn-sm login-submit" disabled={isBusy || !password.trim()}>
                  {isBusy ? <span className="loading loading-spinner loading-sm" /> : <SendIcon className="size-5" strokeWidth={2.2} />}
                </button>
              </label>
            </form>
          </div>
          <div className="login-corner-meta">
            <span>© Mirtle</span>
            <span className="app-footer-sep">·</span>
            <a href="https://github.com/mirtlecn/post" rel="noreferrer" target="_blank">Source code</a>
          </div>
        </div>
      </div>
    </section>
  );
}
