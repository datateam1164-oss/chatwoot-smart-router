import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

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
