import { renderApp } from './components.js';

const root = document.documentElement;
const app = document.querySelector('#app');
let activeRequest = null;
let requestSequence = 0;

class DashboardRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DashboardRequestError';
    this.status = status;
  }
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = nextTheme;
  document.querySelector('[data-action="theme"]')?.setAttribute('aria-pressed', String(nextTheme === 'dark'));
  const label = document.querySelector('[data-theme-label]');
  if (label) label.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'dark' ? '#151216' : '#F2F0F3');
  try {
    localStorage.setItem('kurubase-theme', nextTheme);
  } catch {
    // Theme persistence is optional when browser storage is unavailable.
  }
}

function readSavedTheme() {
  try {
    return localStorage.getItem('kurubase-theme');
  } catch {
    return null;
  }
}

function render(state) {
  if (!app) return;
  app.innerHTML = renderApp(state);
  applyTheme(root.dataset.theme);
}

function readEnvelope(payload, path, responseStatus) {
  if (
    !payload
    || typeof payload !== 'object'
    || !('data' in payload)
    || typeof payload.status !== 'number'
    || payload.status !== responseStatus
  ) {
    throw new DashboardRequestError(502, `${path} returned an invalid response.`);
  }
  return payload;
}

function createDeadline(parentSignal) {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromParent = () => controller.abort();
  parentSignal.addEventListener('abort', abortFromParent, { once: true });
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, 15_000);
  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    dispose: () => {
      clearTimeout(timeoutId);
      parentSignal.removeEventListener('abort', abortFromParent);
    }
  };
}

async function requestData(path, parentSignal) {
  const deadline = createDeadline(parentSignal);
  let response;
  try {
    response = await fetch(path, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: deadline.signal
    });
  } catch (error) {
    deadline.dispose();
    if (parentSignal.aborted) throw error;
    if (deadline.didTimeout()) {
      throw new DashboardRequestError(0, `The request to ${path} exceeded 15 seconds.`);
    }
    throw new DashboardRequestError(0, `The request to ${path} could not reach the API.`);
  }

  let payload;
  try {
    payload = readEnvelope(await response.json(), path, response.status);
  } catch (error) {
    deadline.dispose();
    if (parentSignal.aborted) throw error;
    if (deadline.didTimeout()) {
      throw new DashboardRequestError(0, `The request to ${path} exceeded 15 seconds.`);
    }
    if (error instanceof DashboardRequestError) throw error;
    throw new DashboardRequestError(response.status, `${path} did not return JSON.`);
  }
  deadline.dispose();

  if (!response.ok) {
    const message = payload.error && typeof payload.error.message === 'string'
      ? payload.error.message
      : `The request to ${path} failed.`;
    throw new DashboardRequestError(response.status, message);
  }
  if (payload.data === null) {
    throw new DashboardRequestError(502, `${path} returned no data.`);
  }
  return payload.data;
}

function normalizeIdentity(data) {
  const valid = data
    && typeof data === 'object'
    && typeof data.sub === 'string'
    && data.sub.length > 0
    && (typeof data.org_id === 'string' || data.org_id === null)
    && Array.isArray(data.roles)
    && data.roles.every((role) => typeof role === 'string')
    && Array.isArray(data.scopes)
    && data.scopes.every((scope) => typeof scope === 'string');
  if (!valid) {
    throw new DashboardRequestError(502, '/v1/me returned an invalid identity.');
  }
  return {
    sub: data.sub,
    org_id: data.org_id,
    roles: [...data.roles],
    scopes: [...data.scopes]
  };
}

function normalizeStatus(data) {
  if (!data || typeof data !== 'object' || data.status !== 'ok' || typeof data.subject !== 'string') {
    throw new DashboardRequestError(502, '/v1/admin/status returned an invalid status.');
  }
  return data;
}

function classifyStatus(result, expectedSubject) {
  if (result.status === 'fulfilled') {
    const status = normalizeStatus(result.value);
    if (status.subject !== expectedSubject) {
      return { kind: 'error', message: 'Administrative status returned a different principal.' };
    }
    return { kind: 'ready' };
  }
  const error = result.reason;
  if (error instanceof DOMException && error.name === 'AbortError') throw error;
  if (error instanceof DashboardRequestError && error.status === 403) {
    return { kind: 'restricted' };
  }
  if (error instanceof DashboardRequestError && error.status === 401) {
    return { kind: 'unauthorized' };
  }
  return {
    kind: 'error',
    message: error instanceof Error ? error.message : 'Administrative status could not be loaded.'
  };
}

async function loadDashboard() {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const requestId = ++requestSequence;
  render({ view: 'loading' });

  const [identityResult, statusResult] = await Promise.allSettled([
    requestData('/v1/me', controller.signal),
    requestData('/v1/admin/status', controller.signal)
  ]);
  if (requestId !== requestSequence) return;
  if (controller.signal.aborted) return;

  if (identityResult.status === 'rejected') {
    const error = identityResult.reason;
    if (error instanceof DashboardRequestError && error.status === 401) {
      render({ view: 'unauthorized' });
      return;
    }
    if (error instanceof DashboardRequestError && error.status === 403) {
      render({ view: 'forbidden' });
      return;
    }
    render({
      view: 'error',
      message: error instanceof Error ? error.message : 'The authenticated identity could not be loaded.'
    });
    return;
  }

  try {
    const identity = normalizeIdentity(identityResult.value);
    const status = classifyStatus(statusResult, identity.sub);
    render({ view: 'ready', identity, status });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    render({
      view: 'error',
      message: error instanceof Error ? error.message : 'The dashboard response could not be read.'
    });
  }
}

applyTheme(readSavedTheme());
void loadDashboard();

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'theme') {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  }
  if (target.dataset.action === 'retry') {
    void loadDashboard();
  }
});
