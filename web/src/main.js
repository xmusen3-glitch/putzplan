import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { boot } from './lib/store.svelte.js';

mount(App, { target: document.getElementById('app') });
boot();
if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
