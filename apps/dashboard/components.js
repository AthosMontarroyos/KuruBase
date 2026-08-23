const icons = {
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  activity: '<path d="M3 12h3l2-6 4 12 2-6h7"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.7 4L21 14m0 0v5m0-5h-5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  logo: '<path d="M5 17V7l7-3 7 3v10l-7 3-7-3Z"/><path d="M8 8.5 12 7l4 1.5v7L12 17l-4-1.5v-7Z"/><path d="M12 7v10"/>'
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.more}</svg>`;
}

export function renderSidebar(active = 'projects') {
  const nav = [
    ['projects', 'Projects', 'grid'],
    ['system', 'System', 'server'],
    ['activity', 'Activity', 'activity'],
    ['settings', 'Settings', 'sliders']
  ];

  return `<aside class="sidebar">
    <a class="brand" href="#projects" aria-label="KuruBase home"><span class="brand__mark">${icon('logo')}</span><span class="brand__word">Kuru<span>Base</span></span></a>
    <button class="workspace" type="button" data-action="workspace"><span class="workspace__avatar">KB</span><span class="workspace__copy"><strong>Owner workspace</strong><small>Self-hosted instance</small></span>${icon('chevron', 'workspace__chevron')}</button>
    <div class="sidebar__section"><p class="sidebar__label">Workspace</p><nav class="nav" aria-label="Main navigation">${nav.map(([id, label, iconName]) => `<a class="nav__link ${id === active ? 'is-active' : ''}" href="#${id}" ${id === active ? 'aria-current="page"' : ''} data-nav="${id}">${icon(iconName)}<span>${label}</span></a>`).join('')}</nav></div>
    <div class="sidebar__footer"><div class="sidebar__footer-row"><span class="status-dot status-dot--ready"></span><span>Instance online</span></div><div class="sidebar__footer-meta"><span>API v0.1</span><span>2 projects</span></div></div>
  </aside>`;
}

export function renderTopbar() {
  return `<header class="topbar"><div class="topbar__crumbs"><span>Administration</span><span class="crumb-separator">/</span><strong>Projects</strong></div><div class="topbar__tools"><span class="live-status"><span class="status-dot status-dot--ready"></span>System ready</span><span class="topbar__divider" aria-hidden="true"></span><button class="theme-toggle" type="button" data-action="theme" aria-pressed="false"><span class="theme-toggle__icon">${icon('sun')}</span><span data-theme-label>Light</span><span class="theme-toggle__chevron">${icon('chevron')}</span></button><button class="icon-button" type="button" data-action="more" aria-label="More administration actions">${icon('more')}</button></div></header>`;
}

export function renderStatusChip(label, tone = 'ready', iconName = 'check') {
  return `<span class="status-chip status-chip--${tone}">${icon(iconName)}<span>${label}</span></span>`;
}

export function renderSummaryStrip(projects) {
  const readyCount = projects.filter((project) => project.status === 'ready').length;
  return `<section class="summary-strip" aria-label="Instance summary"><div class="summary-strip__lead"><span class="summary-icon">${icon('activity')}</span><span><strong>Instance health</strong><small>All connected services are responding</small></span></div><div class="summary-stat"><span class="summary-stat__value">${readyCount}/${projects.length}</span><span class="summary-stat__label">Projects ready</span></div><div class="summary-stat"><span class="summary-stat__value">PostgreSQL</span><span class="summary-stat__label">Primary data layer</span></div><div class="summary-strip__action"><button class="text-button" type="button" data-action="refresh">Refresh status ${icon('refresh')}</button></div></section>`;
}

export function renderProjectVisual(project) {
  const visuals = {
    automation: `<div class="visual-machine visual-machine--automation" aria-hidden="true"><span class="automation-orbit automation-orbit--outer"></span><span class="automation-orbit automation-orbit--inner"></span><span class="automation-node automation-node--one"></span><span class="automation-node automation-node--two"></span><span class="automation-node automation-node--three"></span><span class="automation-core">${icon('activity')}</span><span class="automation-signal"><i></i><i></i><i></i><i></i></span></div>`,
    database: `<div class="visual-machine visual-machine--database" aria-hidden="true"><span class="database-axis"></span><span class="database-stack"><i></i><i></i><i></i></span><span class="database-policy">${icon('check')}</span><span class="database-route database-route--one"></span><span class="database-route database-route--two"></span><span class="database-node database-node--one"></span><span class="database-node database-node--two"></span></div>`
  };

  return `<div class="project-visual project-visual--${project.visual}" role="img" aria-label="${project.visualDescription}">${visuals[project.visual] ?? visuals.database}<span class="project-visual__caption"><strong>${project.visualTitle}</strong><small>${project.visualMeta}</small></span></div>`;
}

export function renderProjectCard(project) {
  return `<article class="project-card" data-project-id="${project.id}" data-accent="${project.accent}"><div class="project-card__media"><div class="media-label"><span>${icon('grid')}Theme-aware component</span><button class="media-menu" type="button" data-action="card-menu" aria-label="More actions for ${project.name}">${icon('more')}</button></div>${renderProjectVisual(project)}</div><div class="project-card__body"><div class="project-card__heading"><div><p class="project-card__type">${project.type}</p><h2>${project.name}</h2></div><span class="project-card__accent-dot" aria-hidden="true"></span></div><p class="project-card__description">${project.description}</p><div class="project-card__statuses">${renderStatusChip('API ready', 'ready', 'activity')}${renderStatusChip('PostgreSQL ready', 'data', 'database')}</div><div class="project-card__footer"><span>Last active <time datetime="${project.datetime}">${project.lastActive}</time></span><button class="open-button" type="button" data-action="open-project" data-project="${project.id}">Open project ${icon('arrow')}</button></div></div></article>`;
}

export function renderAddProjectCard() {
  return `<button class="add-project" type="button" data-action="add-project"><span class="add-project__icon">${icon('plus')}</span><strong>Add a project</strong><span>Connect another self-hosted instance</span></button>`;
}

export function renderApp(projects) {
  return `<div class="app-shell">${renderSidebar()}<div class="app-content">${renderTopbar()}<main class="main-content"><section class="page-heading"><div><h1>Projects</h1><p>Choose a project to inspect its data and services.</p></div><div class="page-heading__actions"><span class="view-label">${icon('grid')} Grid view</span><button class="primary-button" type="button" data-action="add-project">Add project ${icon('plus')}</button></div></section>${renderSummaryStrip(projects)}<section class="project-section" aria-labelledby="project-list-title"><div class="section-heading"><div><h2 id="project-list-title">Your projects</h2><p>Each visual is rendered from the active interface theme.</p></div><span class="section-count">${projects.length} connected</span></div><div class="project-grid">${projects.map(renderProjectCard).join('')}${renderAddProjectCard()}</div></section></main></div></div>`;
}
