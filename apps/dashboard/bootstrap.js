const app = document.querySelector('#app');

import('./app.js').catch((error) => {
  console.error('KuruBase dashboard failed to start.', error);

  if (!app) return;

  app.innerHTML = `
    <main class="main-content">
      <section class="page-heading" role="alert">
        <div>
          <h1>Dashboard unavailable</h1>
          <p>The interface could not start. Refresh the page to try again.</p>
        </div>
      </section>
    </main>
  `;
});
