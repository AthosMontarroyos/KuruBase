import { renderApp } from './components.js';

const projects = [
  {
    id: 'kuruttina-bot',
    name: 'KuruttinaBot',
    type: 'Discord service',
    description: 'Automation data and bot operations in one place.',
    image: '/assets/kuruttina-bot-neutral.png',
    imageAlt: 'Replaceable project image preset for KuruttinaBot',
    imageLabel: 'Image slot · preset',
    accent: 'blue',
    status: 'ready',
    lastActive: 'Today, 14:32',
    datetime: '2026-08-23T14:32:00'
  },
  {
    id: 'kurubase-demo',
    name: 'KuruBase Demo',
    type: 'Database workspace',
    description: 'A safe space to inspect tables, policies, and API access.',
    image: '/assets/kurubase-demo-neutral.png',
    imageAlt: 'Replaceable project image preset for KuruBase Demo',
    imageLabel: 'Image slot · preset',
    accent: 'violet',
    status: 'ready',
    lastActive: 'Today, 13:07',
    datetime: '2026-08-23T13:07:00'
  }
];

const root = document.documentElement;
const app = document.querySelector('#app');
const toast = document.querySelector('.toast');
let toastTimer;

app.innerHTML = renderApp(projects);

function say(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = nextTheme;
  document.querySelector('[data-action="theme"]')?.setAttribute('aria-pressed', String(nextTheme === 'dark'));
  const label = document.querySelector('[data-theme-label]');
  if (label) label.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'dark' ? '#0C151A' : '#EDF3F5');
  localStorage.setItem('kurubase-theme', nextTheme);
}

function bindImageChange(projectId) {
  const input = document.querySelector(`[data-file-input="${projectId}"]`);
  const image = document.querySelector(`[data-project-image="${projectId}"]`);
  if (!input || !image) return;
  input.click();
  input.onchange = () => {
    const [file] = input.files ?? [];
    if (!file) return;
    image.src = URL.createObjectURL(file);
    image.alt = `${file.name} project image`;
    say(`Image updated for ${projects.find((project) => project.id === projectId)?.name ?? 'project'}.`);
  };
}

applyTheme(localStorage.getItem('kurubase-theme'));

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action], [data-nav]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'theme') applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  if (action === 'change-image') bindImageChange(target.dataset.project);
  if (action === 'refresh') say('Status refreshed. All services are ready.');
  if (action === 'open-project') say(`Project opener for ${target.dataset.project} is next in the MVP.`);
  if (action === 'add-project') say('Project connection flow is next in the MVP.');
  if (action === 'workspace') say('Workspace switcher is ready for additional instances.');
  if (action === 'more' || action === 'card-menu') say('More administration actions are coming next.');
  if (target.dataset.nav && target.dataset.nav !== 'projects') {
    event.preventDefault();
    say(`${target.textContent.trim()} is the next administration view.`);
  }
});
