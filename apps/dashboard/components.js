const icons = {
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  activity: '<path d="M3 12h3l2-6 4 12 2-6h7"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.7 4L21 14m0 0v5m0-5h-5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  logo: '<path d="M5 17V7l7-3 7 3v10l-7 3-7-3Z"/><path d="M8 8.5 12 7l4 1.5v7L12 17l-4-1.5v-7Z"/><path d="M12 7v10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
  empty: '<path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Z"/><path d="m5 7.5 7 3.5 7-3.5M12 11v9"/>'
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.more}</svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusCopy(status) {
  if (status.kind === 'ready') {
    return { label: 'System ready', detail: 'Administrative API available', tone: 'ready' };
  }
  if (status.kind === 'restricted') {
    return { label: 'Status restricted', detail: 'Administrative scope required', tone: 'attention' };
  }
  if (status.kind === 'unauthorized') {
    return { label: 'Session expired', detail: 'Authentication is required', tone: 'attention' };
  }
  if (status.kind === 'error') {
    return { label: 'Status unavailable', detail: 'Administrative status could not load', tone: 'attention' };
  }
  return { label: 'Checking status', detail: 'Waiting for the API', tone: 'loading' };
}

function renderSidebar(identity, status) {
  const copy = statusCopy(status);
  const subject = identity ? escapeHtml(identity.sub) : 'Loading identity…';
  const organization = identity
    ? identity.org_id
      ? `Organization ${escapeHtml(identity.org_id)}`
      : 'No organization assigned'
    : 'Verifying same-origin session';
  const roleCount = identity ? identity.roles.length : null;
  const scopeCount = identity ? identity.scopes.length : null;
  const nav = [
    ['projects', 'Projects', 'grid', false],
    ['system', 'System', 'server', true],
    ['activity', 'Activity', 'activity', true],
    ['settings', 'Settings', 'sliders', true]
  ];

  return `<aside class="sidebar">
    <a class="brand" href="#projects" aria-label="KuruBase home"><span class="brand__mark">${icon('logo')}</span><span class="brand__word">Kuru<span>Base</span></span></a>
    <div class="workspace"><span class="workspace__avatar">ID</span><span class="workspace__copy"><strong title="${subject}">${subject}</strong><small>${organization}</small></span>${icon('user', 'workspace__chevron')}</div>
    <div class="sidebar__section"><p class="sidebar__label">Workspace</p><nav class="nav" aria-label="Main navigation">${nav.map(([id, label, iconName, disabled]) => `<a class="nav__link ${id === 'projects' ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}" href="#${id}" ${id === 'projects' ? 'aria-current="page"' : ''} ${disabled ? 'aria-disabled="true" tabindex="-1"' : ''}>${icon(iconName)}<span>${label}</span></a>`).join('')}</nav></div>
    <div class="sidebar__footer"><div class="sidebar__footer-row"><span class="status-dot status-dot--${copy.tone}"></span><span>${copy.label}</span></div><div class="sidebar__footer-meta">${identity ? `<span>${roleCount} ${roleCount === 1 ? 'role' : 'roles'}</span><span>${scopeCount} ${scopeCount === 1 ? 'scope' : 'scopes'}</span>` : '<span>Identity pending</span>'}</div></div>
  </aside>`;
}

function renderTopbar(status) {
  const copy = statusCopy(status);
  return `<header class="topbar"><div class="topbar__crumbs"><span>Administration</span><span class="crumb-separator">/</span><strong>Projects</strong></div><div class="topbar__tools"><span class="live-status live-status--${copy.tone}" title="${escapeHtml(copy.detail)}" role="status" aria-live="polite"><span class="status-dot status-dot--${copy.tone}"></span>${copy.label}</span><span class="topbar__divider" aria-hidden="true"></span><button class="theme-toggle" type="button" data-action="theme" aria-pressed="false"><span class="theme-toggle__icon">${icon('sun')}</span><span data-theme-label>Light</span><span class="theme-toggle__chevron">${icon('chevron')}</span></button></div></header>`;
}

function renderShell(content, identity = null, status = { kind: 'loading' }) {
  return `<div class="app-shell">${renderSidebar(identity, status)}<div class="app-content">${renderTopbar(status)}<main class="main-content" id="main-content">${content}</main></div></div>`;
}

function renderLoading() {
  return renderShell(`<section class="page-heading"><div><h1>Projects</h1><p>Loading your identity and administrative status.</p></div></section>
    <section class="summary-strip summary-strip--loading" aria-label="Loading instance summary" aria-busy="true"><span class="summary-icon loading-spinner">${icon('refresh')}</span><span class="loading-copy"><strong>Checking this KuruBase instance</strong><small>Waiting for a secure same-origin response…</small></span></section>
    <section class="loading-panel" aria-hidden="true"><span></span><span></span><span></span></section>`);
}

function renderFailure(kind, message) {
  const unauthorized = kind === 'unauthorized';
  const forbidden = kind === 'forbidden';
  const title = unauthorized ? 'Sign in required' : forbidden ? 'Access denied' : 'Dashboard unavailable';
  const description = unauthorized
    ? 'Your Cloudflare Access session is missing or has expired. Sign in through the protected dashboard, then try again.'
    : forbidden
      ? 'Your identity was recognized, but it is not authorized to use this KuruBase dashboard.'
      : message || 'The dashboard could not reach the KuruBase API. Check the connection and try again.';
  const status = { kind: unauthorized ? 'unauthorized' : 'error' };

  return renderShell(`<section class="page-heading"><div><h1>${title}</h1><p>${escapeHtml(description)}</p></div></section>
    <section class="state-panel state-panel--${forbidden ? 'forbidden' : unauthorized ? 'unauthorized' : 'error'}" role="${unauthorized || forbidden ? 'status' : 'alert'}">
      <span class="state-panel__icon">${icon(unauthorized ? 'lock' : forbidden ? 'shield' : 'alert')}</span>
      <div><h2>${title}</h2><p>${escapeHtml(description)}</p></div>
      <button class="primary-button" type="button" data-action="retry">Try again ${icon('refresh')}</button>
    </section>`, null, status);
}

function renderTagList(items, emptyLabel) {
  if (items.length === 0) {
    return `<p class="permission-empty">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<ul class="permission-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderSummary(identity, status) {
  const copy = statusCopy(status);
  const statusValue = status.kind === 'ready' ? 'Ready' : status.kind === 'restricted' ? 'Restricted' : 'Unavailable';
  const statusDescription = status.kind === 'ready'
    ? 'The administrative API accepted the current principal.'
    : status.kind === 'restricted'
      ? 'Identity loaded. The kurubase:admin scope is required to read status.'
      : status.message || 'The administrative status endpoint did not respond.';
  const organization = identity.org_id ? escapeHtml(identity.org_id) : 'Unassigned';

  return `<section class="summary-strip summary-strip--${copy.tone}" aria-label="Instance summary">
    <div class="summary-strip__lead"><span class="summary-icon">${icon(status.kind === 'ready' ? 'activity' : status.kind === 'restricted' ? 'shield' : 'alert')}</span><span><strong>${copy.detail}</strong><small>${escapeHtml(statusDescription)}</small></span></div>
    <div class="summary-stat"><span class="summary-stat__value">${statusValue}</span><span class="summary-stat__label">Administrative API</span></div>
    <div class="summary-stat"><span class="summary-stat__value summary-stat__value--wrap" title="${organization}">${organization}</span><span class="summary-stat__label">Organization</span></div>
    <div class="summary-strip__action"><button class="text-button" type="button" data-action="retry">Refresh status ${icon('refresh')}</button></div>
  </section>`;
}

function renderIdentity(identity) {
  const subject = escapeHtml(identity.sub);
  const organization = identity.org_id ? escapeHtml(identity.org_id) : 'Not assigned';

  return `<section class="identity-section" aria-labelledby="identity-title">
    <div class="section-heading"><div><h2 id="identity-title">Current identity</h2><p>The normalized principal used for API authorization and row-level security.</p></div><span class="identity-badge">${icon('shield')} Verified</span></div>
    <div class="identity-panel">
      <dl class="identity-details"><div><dt>Subject</dt><dd title="${subject}">${subject}</dd></div><div><dt>Organization</dt><dd title="${organization}">${organization}</dd></div></dl>
      <div class="permission-group"><h3>Roles</h3>${renderTagList(identity.roles, 'No roles assigned')}</div>
      <div class="permission-group"><h3>Scopes</h3>${renderTagList(identity.scopes, 'No scopes assigned')}</div>
    </div>
  </section>`;
}

function renderProjectEmptyState() {
  return `<section class="project-section" aria-labelledby="project-list-title"><div class="section-heading"><div><h2 id="project-list-title">Your projects</h2><p>Connected project data will appear here when it is exposed by the API.</p></div></div>
    <div class="empty-state"><span class="empty-state__visual">${icon('empty')}</span><div><h3>No project data available</h3><p>This KuruBase API does not currently expose a project catalog. No placeholder projects are shown.</p></div></div>
  </section>`;
}

function renderReady(identity, status) {
  return renderShell(`<section class="page-heading"><div><h1>Projects</h1><p>Inspect the authenticated principal and the status available to it.</p></div><div class="page-heading__actions"><button class="primary-button" type="button" data-action="retry">Refresh ${icon('refresh')}</button></div></section>
    ${renderSummary(identity, status)}
    ${renderIdentity(identity)}
    ${renderProjectEmptyState()}`, identity, status);
}

export function renderApp(state) {
  if (state.view === 'loading') return renderLoading();
  if (state.view === 'unauthorized') return renderFailure('unauthorized');
  if (state.view === 'forbidden') return renderFailure('forbidden');
  if (state.view === 'error') return renderFailure('error', state.message);
  return renderReady(state.identity, state.status);
}
