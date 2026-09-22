function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
}

function metric(value, unit) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} ${unit}` : '—';
}

function renderPublicTracks(publicTracks) {
  if (!publicTracks.length) return '<p class="home-note">Публичные маршруты пока недоступны.</p>';
  return publicTracks.map((track) => `
    <a class="home-track-link" href="${escapeHtml(track.url)}">
      <span><strong>${escapeHtml(track.title)}</strong><small>Маршрут · ${metric(track.distanceKm, 'км')}</small></span><b aria-hidden="true">↗</b>
    </a>`).join('');
}

export function renderHomePage(publicTracks = []) {
  const primary = publicTracks[0];
  const primaryUrl = primary?.url || '#public-tracks';
  const primaryTitle = primary?.title || 'Маршрут недоступен';
  return `
    <main class="home-page" id="home">
      <nav class="home-nav" aria-label="Разделы главной страницы">
        <a href="#passport">Возможности</a><a href="#platforms">Платформы</a><a href="#public-tracks">Публичные треки</a>
      </nav>

      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero-copy">
          <p class="route-kicker">ЦЕНТР ГОТОВОГО МАРШРУТА</p>
          <h1 id="home-title">Один трек.<br />Одна ссылка.</h1>
          <p class="home-lede">Публичная страница маршрута с картой, профилем, покрытием, важными точками и оригинальным GPX.</p>
          <p class="home-note">Получатель открывает и скачивает трек без регистрации в GetGPX.</p>
          <div class="home-actions">
            <a class="home-primary" data-home-guest href="/api/auth/google">Войти и опубликовать GPX <span aria-hidden="true">↗</span></a>
            <button class="home-primary" data-home-author data-auth-upload type="button" hidden>Загрузить GPX <span aria-hidden="true">＋</span></button>
            <a class="home-secondary" href="${escapeHtml(primaryUrl)}">Открыть реальный трек</a>
          </div>
        </div>
        <article class="home-route-card" aria-label="Публичный маршрут ${escapeHtml(primaryTitle)}">
          <header><div><span>ПУБЛИЧНЫЙ ТРЕК</span><h2>${escapeHtml(primaryTitle)}</h2></div><a href="${escapeHtml(primaryUrl)}" aria-label="Открыть ${escapeHtml(primaryTitle)}">↗</a></header>
          <a class="home-map-link" href="${escapeHtml(primaryUrl)}" aria-label="Открыть карту маршрута ${escapeHtml(primaryTitle)}"><div id="home-example-map" aria-hidden="true"></div><span class="home-map-loading" id="home-map-loading">Загружаем карту…</span></a>
          <dl class="home-route-stats"><div><dt>Дистанция</dt><dd>${metric(primary?.distanceKm, 'км')}</dd></div><div><dt>Набор</dt><dd>${metric(primary?.ascentM, 'м')}</dd></div><div><dt>Точки</dt><dd>${Number.isSafeInteger(primary?.pointsOfInterestCount) ? primary.pointsOfInterestCount : '—'}</dd></div></dl>
        </article>
      </section>

      <section class="home-proof" aria-label="Основные возможности"><div><strong>Без аккаунта</strong><span>для просмотра и скачивания</span></div><div><strong>Оригинальный GPX</strong><span>по прямой публичной ссылке</span></div><div><strong>Открытые данные</strong><span>для анализа маршрута</span></div></section>

      <section class="home-section home-passport" id="passport" aria-labelledby="passport-title">
        <div class="home-section-heading"><p class="route-kicker">01 · ПАСПОРТ МАРШРУТА</p><div><h2 id="passport-title">Всё необходимое перед стартом</h2><p>Не нарисованный макет, а те же данные и интерфейс, которые получает каждый опубликованный трек.</p></div></div>
        <nav class="home-preview-nav" aria-label="Фрагменты страницы трека"><a href="#preview-map">Карта</a><a href="#preview-profile">Профиль</a><a href="#preview-pois">Точки</a><a href="#preview-surface">Покрытия</a><a href="#preview-climbs">Подъёмы</a></nav>
        <div class="home-preview-rail" aria-label="Возможности страницы трека">
          <article class="home-preview-card home-preview-map" id="preview-map"><header><span>Карта маршрута</span><small>Реальный трек · Girona</small></header><div id="home-preview-example-map" aria-hidden="true"></div><div class="home-preview-map-copy"><strong>Маршрут на карте</strong><p>Цвет по градиенту, покрытию, типу дороги или качеству.</p><a href="#preview-profile" aria-label="Следующий фрагмент">→</a></div></article>
          <article class="home-preview-card" id="preview-profile"><header><span>Профиль высот</span><small>3 810 м набора</small></header><div class="home-mini-profile" aria-hidden="true"><svg viewBox="0 0 600 230" preserveAspectRatio="none"><path class="home-profile-fill" d="M0 205 L0 174 35 156 70 166 110 130 145 145 180 116 220 124 260 80 300 112 340 64 380 86 420 38 460 96 500 74 545 138 600 122 L600 205Z"/><path class="home-profile-line" d="M0 174 35 156 70 166 110 130 145 145 180 116 220 124 260 80 300 112 340 64 380 86 420 38 460 96 500 74 545 138 600 122"/></svg><div><span>0 км</span><span>100 км</span><span>201,7 км</span></div></div><footer><b>506 м</b><span>максимальная высота</span><a href="#preview-pois" aria-label="Следующий фрагмент">→</a></footer></article>
          <article class="home-preview-card" id="preview-pois"><header><span>Точки интереса</span><small>25 точек</small></header><div class="home-mini-pois"><span><b>7</b><i>Water Point 1<small>WATER</small></i></span><span><b>11</b><i>Feed Zone 1<small>FOOD</small></i></span><span><b>14</b><i>Assistance area<small>AID STATION</small></i></span></div><footer><b>Вода, питание, предупреждения</b><a href="#preview-surface" aria-label="Следующий фрагмент">→</a></footer></article>
          <article class="home-preview-card" id="preview-surface"><header><span>Информация о трассе</span><small>OpenStreetMap</small></header><div class="home-mini-surfaces"><div><span style="--share:55%;--tone:#8b6b43">Грунт <b>55%</b></span></div><div><span style="--share:17%;--tone:#9b875d">Твёрдое <b>17%</b></span></div><div><span style="--share:15%;--tone:#c59043">Гравий <b>15%</b></span></div><div><span style="--share:13%;--tone:#6f7771">Асфальт <b>13%</b></span></div></div><footer><b>201,7 км проанализировано</b><a href="#preview-climbs" aria-label="Следующий фрагмент">→</a></footer></article>
          <article class="home-preview-card" id="preview-climbs"><header><span>Подъёмы и спуски</span><small>Автоматически</small></header><div class="home-mini-climbs"><span><b>#1</b><strong>Кат. 4</strong><i>3,4% · 168 м · 4,12 км</i></span><span><b>#2</b><strong>Кат. 3</strong><i>7,0% · 260 м · 3,02 км</i></span><span><b>#3</b><strong>Кат. 3</strong><i>4,4% · 266 м · 4,57 км</i></span></div><footer><a href="#preview-surface" aria-label="Предыдущий фрагмент">←</a><b>9 подъёмов · 7 спусков</b></footer></article>
        </div>
        <p class="home-scroll-hint">Листайте горизонтально или выбирайте раздел выше</p>
      </section>

      <section class="home-section home-platforms" id="platforms" aria-labelledby="platforms-title"><div class="home-platform-copy"><p class="route-kicker">02 · НЕЗАВИСИМАЯ СТРАНИЦА</p><h2 id="platforms-title">Маршрут не обязан жить в одном приложении</h2><p>Соберите ссылки на уже опубликованные версии трека в одном месте. GetGPX не переносит и не синхронизирует их автоматически. Ссылки добавляет автор вручную.</p><span class="home-soon">ДОБАВЛЯЮТСЯ ПРИ РЕДАКТИРОВАНИИ</span></div><div class="home-platform-list" aria-label="Поддерживаемые платформы"><span>Komoot <b>↗</b></span><span>Strava <b>↗</b></span><span>Garmin <b>↗</b></span><span>Ride with GPS <b>↗</b></span></div></section>

      <section class="home-section home-tracks" id="public-tracks" aria-labelledby="public-tracks-title"><div class="home-section-heading"><p class="route-kicker">03 · ПРИМЕРЫ</p><div><h2 id="public-tracks-title">Откройте настоящие публичные треки</h2><p>Просмотр и загрузка GPX доступны сразу. Авторизация понадобится только для публикации собственного маршрута.</p></div></div><div class="home-track-links">${renderPublicTracks(publicTracks)}</div></section>

      <section class="home-library" aria-labelledby="library-title"><div><p class="route-kicker">ЛИЧНАЯ БИБЛИОТЕКА</p><h2 id="library-title">Свои маршруты всегда под рукой</h2><p>Поиск уже доступен. Коллекции и теги появятся дальше.</p></div><span class="home-soon">КОЛЛЕКЦИИ И ТЕГИ · СКОРО</span></section>
      <section class="home-final" aria-labelledby="home-final-title"><p class="route-kicker">ГОТОВЫЙ GPX УЖЕ ЕСТЬ?</p><h2 id="home-final-title">Дайте маршруту одну хорошую ссылку</h2><a class="home-primary" data-home-guest href="/api/auth/google">Войти и опубликовать GPX <span aria-hidden="true">↗</span></a><button class="home-primary" data-home-author data-auth-upload type="button" hidden>Загрузить GPX <span aria-hidden="true">＋</span></button></section>
    </main>`;
}
