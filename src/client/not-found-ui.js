import { htmlMessage } from './i18n.js';
export function renderNotFoundPage() {
  return `
    <main class="not-found-page" id="not-found" aria-labelledby="not-found-title">
      <div class="not-found-code" aria-hidden="true">404</div>
      <section class="not-found-copy">
        <p class="route-kicker">${htmlMessage('notFound.kicker')}</p>
        <h1 id="not-found-title">${htmlMessage('notFound.title')}</h1>
        <p>${htmlMessage('notFound.description')}</p>
        <div class="not-found-actions">
          <a class="home-primary" href="/">${htmlMessage('notFound.home')} <span aria-hidden="true">→</span></a>
          <a class="home-secondary" href="/my-tracks">${htmlMessage('common.myTracks')}</a>
        </div>
      </section>
    </main>`;
}
