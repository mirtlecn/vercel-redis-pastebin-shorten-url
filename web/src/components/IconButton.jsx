export function IconButton({ icon, title, className = '', tooltip = 'bottom', ...props }) {
  const Icon = icon;
  const tooltipClass = tooltip === 'top' ? 'tooltip-top' : 'tooltip-bottom';
  return (
    <div className={`tooltip ${tooltipClass}`} data-tip={title}>
      <button className={`btn btn-circle btn-md icon-button ${className}`.trim()} type="button" {...props}>
        <Icon className="size-5" strokeWidth={2.1} />
      </button>
    </div>
  );
}
