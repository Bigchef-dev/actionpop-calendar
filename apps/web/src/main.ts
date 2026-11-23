import { createApp } from 'vue';
import App from './App.vue';
import './assets/calendar.css';

const BASE_PATH: string = (
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') as string
).replace(/\/$/, '');

/** The dedicated page answers at `/etat`; a static host without rewrites uses `#/etat`. */
function currentPage(): 'experience' | 'updates' {
  const { pathname, hash } = window.location;
  const path =
    BASE_PATH !== '' && pathname.startsWith(BASE_PATH)
      ? pathname.slice(BASE_PATH.length)
      : pathname;
  return path === '/etat' || path === '/etat/' || hash === '#/etat' ? 'updates' : 'experience';
}

createApp(App, { page: currentPage() }).mount('#app');
