const app = document.querySelector('#app');

import('./app.js').catch((error) => {
  console.error('KuruBase dashboard failed to start.', error);

  if (!app) return;

  app.innerHTML = `
    <main class="main-content">
      <section class="page-heading">
        <div><h1>Dashboard unavailable</h1><p>The interface could not start.</p></div>
      </section>
      <section class="state-panel state-panel--error state-panel--bootstrap" role="alert">
        <div><h2>Interface failed to load</h2><p>Refresh the page to load the dashboard again.</p></div>
        <button class="primary-button" type="button" data-bootstrap-retry>Refresh page</button>
      </section>
    </main>
  `;
  app.querySelector('[data-bootstrap-retry]')?.addEventListener('click', () => window.location.reload());
});
