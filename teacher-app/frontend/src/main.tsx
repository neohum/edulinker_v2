import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

// Intercept network requests to use configured Server IP
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  let serverIp = localStorage.getItem('serverIP') || 'localhost';
  serverIp = serverIp.split(':')[0].replace(/https?:\/\//, ''); // strip port and http://
  if (typeof resource === 'string' && resource.startsWith('http://localhost:5200')) {
    resource = resource.replace('http://localhost:5200', `http://${serverIp}:5200`);
  }
  return originalFetch(resource, config);
};

const OriginalWebSocket = window.WebSocket;
(window as any).WebSocket = function (url: string | URL, protocols?: string | string[]) {
  let serverIp = localStorage.getItem('serverIP') || 'localhost';
  serverIp = serverIp.split(':')[0].replace(/https?:\/\//, ''); // strip port and http://
  let urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.startsWith('ws://localhost:5200')) {
    urlStr = urlStr.replace('ws://localhost:5200', `ws://${serverIp}:5200`);
  }
  return new OriginalWebSocket(urlStr, protocols);
};

const container = document.getElementById('root')
const root = createRoot(container!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
