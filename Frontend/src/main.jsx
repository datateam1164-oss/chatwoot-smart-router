import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

function applyDynamicRoutingFavicon() {
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Rounded square background
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#1E1B4B');
    grad.addColorStop(0.55, '#312E81');
    grad.addColorStop(1, '#B45F3A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(2, 2, 60, 60, 14);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6366F1';
    ctx.stroke();

    // 3 Routing branches from left hub (15, 32) to 3 agent nodes
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';

    // Top branch
    ctx.beginPath();
    ctx.moveTo(16, 32);
    ctx.bezierCurveTo(28, 32, 28, 16, 43, 16);
    ctx.stroke();

    // Middle branch
    ctx.beginPath();
    ctx.moveTo(16, 32);
    ctx.lineTo(45, 32);
    ctx.stroke();

    // Bottom branch
    ctx.beginPath();
    ctx.moveTo(16, 32);
    ctx.bezierCurveTo(28, 32, 28, 48, 43, 48);
    ctx.stroke();

    // Source Hub node
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(15, 32, 7, 0, Math.PI * 2);
    ctx.fill();

    // Target Agent nodes
    const targets = [
      { x: 49, y: 16, color: '#34D399' },
      { x: 51, y: 32, color: '#38BDF8' },
      { x: 49, y: 48, color: '#F472B6' },
    ];
    targets.forEach((t) => {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const pngUrl = canvas.toDataURL('image/png');
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove());

    ['icon', 'shortcut icon', 'apple-touch-icon'].forEach((rel) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.type = 'image/png';
      link.href = pngUrl;
      document.head.appendChild(link);
    });
  } catch (_) {
    // Ignore canvas errors in non-browser environments
  }
}

applyDynamicRoutingFavicon();

const isStaticCloud =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('hf.space') ||
    window.location.hostname.includes('huggingface.co') ||
    window.location.protocol === 'file:');

const RouterComponent = isStaticCloud ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterComponent>
      <App />
    </RouterComponent>
  </React.StrictMode>
);
