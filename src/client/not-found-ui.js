export function renderNotFoundPage() {
  return `
    <main class="not-found-page" id="not-found" aria-labelledby="not-found-title">
      <div class="not-found-code" aria-hidden="true">404</div>
      <section class="not-found-copy">
        <p class="route-kicker">МАРШРУТ СБИЛСЯ С ПУТИ</p>
        <h1 id="not-found-title">Страница не найдена</h1>
        <p>Такого адреса нет. Возможно, ссылка устарела или в ней допущена ошибка.</p>
        <div class="not-found-actions">
          <a class="home-primary" href="/">На главную <span aria-hidden="true">→</span></a>
          <a class="home-secondary" href="/my-tracks">Мои треки</a>
        </div>
      </section>
    </main>`;
}
