import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { isDemoPath } from './demo/demoMode.js';
import { registerEngineCache } from './engine/register-engine-cache.js';
import './styles/tokens.css';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
const root = createRoot(container);

async function start(): Promise<void> {
  // The public demo runs on recorded sample data: no API, no engine, no service worker.
  if (isDemoPath(window.location.pathname)) await (await import('./demo/installDemo.js')).installDemo();
  else registerEngineCache();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void start();
