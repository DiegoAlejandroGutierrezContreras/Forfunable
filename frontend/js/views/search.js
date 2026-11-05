/**
 * 03_23 Búsqueda predictiva y buscador global (sugerencias en la barra superior)
 * 02_18 Búsqueda técnica avanzada y explorador de hilos (filtros por tipo, comunidad, formato, fecha y orden).
 * Conectada a /api/v1/search/predictive (publicaciones, comunidades y usuarios) y /api/v1/posts.
 */

window.SearchView = {
  hideSuggest() { const el = document.getElementById('search-suggest'); if (el) el.classList.add('hidden'); },
  submitForm(form) { this.setQuery(form.q.value); },

  filters: { type: 'all', community: '', format: '', period: 'all', sort: 'relevance' },

  // Sugerencias mientras se escribe en la barra superior
  attachHeader() {
    const input = document.getElementById('header-search');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    const box = document.createElement('div');
    box.id = 'search-suggest';
    box.className = 'panel absolute left-0 right-0 top-full z-50 mt-2 hidden max-h-[70vh] overflow-y-auto p-2';
    input.parentElement.appendChild(box);
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { box.classList.add('hidden'); return; }
      timer = setTimeout(() => this.suggest(q, box), 180);
    });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) box.classList.remove('hidden'); });
    document.addEventListener('click', e => { if (!input.parentElement.contains(e.target)) box.classList.add('hidden'); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { box.classList.add('hidden'); input.blur(); } });
  },

  async suggest(q, box) {
    box.classList.remove('hidden');
    box.innerHTML = `<div class="px-3 py-2 text-body-sm text-ink-muted">Buscando “${UI.esc(q)}”…</div>`;
    try {
      const r = await window.api.predictiveSearch(q);
      const row = (href, icon, label, meta) => `<a href="${href}" data-link class="flex items-center gap-3 rounded px-3 py-2 hover:bg-surface-subtle" ${UI.on('click', 'SearchView.hideSuggest')}>${UI.icon(icon, 'text-[18px] text-ink-muted')}<span class="min-w-0 flex-1 truncate text-body-md">${label}</span><span class="text-label-sm text-ink-muted">${meta}</span></a>`;
      const section = (title, items) => items.length ? `<div class="px-3 pb-1 pt-2 text-label-sm uppercase tracking-wider text-ink-muted">${title}</div>${items.join('')}` : '';
      const html = section('Comunidades', r.communities.slice(0, 4).map(c => row(`/c/${encodeURIComponent(c.name)}`, 'tag', `c/${UI.esc(c.name)}`, 'Comunidad')))
        + section('Usuarios', r.users.slice(0, 4).map(u => row(`/u/${encodeURIComponent(u.username)}`, 'person', `@${UI.esc(u.username)}`, 'Perfil')))
        + section('Publicaciones', r.posts.slice(0, 5).map(p => row(`/posts/${encodeURIComponent(p.id)}`, 'article', UI.esc(p.title), 'Hilo')));
      box.innerHTML = (html || `<div class="px-3 py-2 text-body-sm text-ink-muted">Sin coincidencias rápidas.</div>`)
        + `<a href="/search?q=${encodeURIComponent(q)}" data-link class="mt-1 flex items-center gap-2 rounded border-t border-line px-3 py-2 text-body-sm text-secondary hover:bg-surface-subtle" ${UI.on('click', 'SearchView.hideSuggest')}>${UI.icon('manage_search', 'text-[18px]')} Búsqueda avanzada de “${UI.esc(q)}”</a>`;
    } catch (_) {
      box.innerHTML = `<div class="px-3 py-2 text-body-sm text-danger">No se pudo buscar.</div>`;
    }
  },

  async render(query = {}) {
    this.q = (query.q || '').trim();
    this.filters = { ...this.filters, type: query.type || 'all' };
    const header = document.getElementById('header-search');
    if (header) header.value = this.q;
    $main().innerHTML = `
      ${UI.pageHeader('Explorador global', 'Busca hilos, comunidades y personas. Usa los filtros para afinar resultados técnicos.', '', 'manage_search')}
      <form class="card mb-4 p-2" ${UI.on('submit.prevent', 'SearchView.submitForm', UI.EL)}>
        <div class="relative">
          ${UI.icon('search', 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted')}
          <input name="q" id="global-search-input" class="input border-none bg-transparent py-3 pl-11 text-body-lg" placeholder="Palabra clave, c/comunidad o @usuario…" value="${UI.esc(this.q)}" autocomplete="off" ${UI.on('input', 'SearchView.onType', UI.VALUE)}>
        </div>
      </form>
      <div id="search-filters"></div>
      <div id="search-results-container" class="mt-4 flex flex-col gap-4"></div>`;
    this.paintFilters();
    if (!this.communities) { try { this.communities = await window.api.listCommunities(); } catch (_) { this.communities = []; } this.paintFilters(); }
    this.q.length >= 2 ? this.execute() : this.renderDiscover();
  },

  onType(v) {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setQuery(v), 300);
  },

  setQuery(v) {
    this.q = (v || '').trim();
    window.history.replaceState(null, '', this.q ? `/search?q=${encodeURIComponent(this.q)}` : '/search');
    this.q.length >= 2 ? this.execute() : this.renderDiscover();
  },

  setType(value) { this.setFilter('type', value); },

  setFilter(key, value) {
    this.filters[key] = value;
    this.paintFilters();
    if (this.q.length >= 2) this.paint();
  },

  paintFilters() {
    const f = this.filters;
    const sel = (key, opts) => `<select class="input w-auto py-1.5 text-body-sm" ${UI.on('change', 'SearchView.setFilter', key, UI.VALUE)}>${opts.map(([v, l]) => `<option value="${v}" ${f[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    document.getElementById('search-filters').innerHTML = `
      <div class="flex flex-wrap items-center gap-2">
        ${UI.tabs([{ id: 'all', label: 'Todo' }, { id: 'posts', label: 'Publicaciones', icon: 'article' }, { id: 'communities', label: 'Comunidades', icon: 'groups' }, { id: 'users', label: 'Usuarios', icon: 'person' }], f.type, 'SearchView.setType')}
        <span class="ml-auto flex flex-wrap gap-2">
          ${sel('community', [['', 'Todas las comunidades'], ...(this.communities || []).map(c => [c.id, 'c/' + UI.esc(c.name)])])}
          ${sel('format', [['', 'Cualquier formato'], ['TEXT', 'Texto'], ['IMAGE', 'Imagen'], ['VIDEO', 'Video'], ['LINK', 'Enlace']])}
          ${sel('period', [['all', 'Cualquier fecha'], ['1', 'Últimas 24 h'], ['7', 'Última semana'], ['30', 'Último mes']])}
          ${sel('sort', [['relevance', 'Relevancia'], ['new', 'Más recientes'], ['top', 'Más votados'], ['comments', 'Más comentados']])}
        </span>
      </div>`;
  },

  async execute() {
    const box = document.getElementById('search-results-container');
    box.innerHTML = UI.skeletonPosts(2);
    const q = this.q.replace(/^[@]|^u\/|^c\//, '');
    try {
      const [hits, posts] = await Promise.all([
        window.api.predictiveSearch(q),
        this.postsCache || window.api.listPosts({ sort: 'newest', limit: 100 })
      ]);
      this.postsCache = posts;
      this.hits = hits;
      this.paint();
    } catch (err) {
      box.innerHTML = UI.error(err, () => SearchView.execute());
    }
  },

  // Coincidencia en título y contenido con puntuación por relevancia
  matchPosts() {
    const terms = this.q.toLowerCase().replace(/^[@]|^u\/|^c\//, '').split(/\s+/).filter(Boolean);
    const f = this.filters;
    const since = f.period === 'all' ? 0 : Date.now() - Number(f.period) * 86400000;
    const titleHits = new Set((this.hits.posts || []).map(p => p.id));
    return (this.postsCache || [])
      .map(p => {
        const title = UI.plain(p.title).toLowerCase();
        const body = UI.plain(p.body_text).toLowerCase();
        let score = titleHits.has(p.id) ? 5 : 0;
        terms.forEach(t => { if (title.includes(t)) score += 3; if (body.includes(t)) score += 1; });
        return { p, score };
      })
      .filter(({ p, score }) => score > 0
        && (!f.community || p.community_id === f.community)
        && (!f.format || (p.content_type || 'TEXT') === f.format)
        && new Date(p.created_at).getTime() >= since)
      .sort((a, b) => ({
        relevance: b.score - a.score || (b.p.net_votes || 0) - (a.p.net_votes || 0),
        new: new Date(b.p.created_at) - new Date(a.p.created_at),
        top: (b.p.net_votes || 0) - (a.p.net_votes || 0),
        comments: (b.p.comments_count || 0) - (a.p.comments_count || 0)
      }[f.sort]))
      .map(x => x.p);
  },

  highlight(text) {
    let html = UI.esc(UI.excerpt(text, 220));
    this.q.split(/\s+/).filter(t => t.length > 1).forEach(t => {
      const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      html = html.replace(re, '<mark class="rounded bg-primary/20 px-0.5 text-ink">$1</mark>');
    });
    return html;
  },

  paint() {
    const box = document.getElementById('search-results-container');
    if (!box || !this.hits) return;
    const type = this.filters.type;
    const posts = this.matchPosts();
    const comms = this.hits.communities || [];
    const users = this.hits.users || [];
    const total = posts.length + comms.length + users.length;
    if (!total) {
      box.innerHTML = UI.empty({ icon: 'search_off', title: `Sin resultados para “${UI.esc(this.q)}”`, text: 'Prueba con otras palabras, quita filtros o explora las comunidades.', action: `<a href="/communities" data-link class="btn-secondary">Explorar comunidades</a>` });
      return;
    }
    const section = (title, count, html) => `<section><h3 class="mb-2 flex items-center gap-2 text-label-sm uppercase tracking-wider text-ink-muted">${title}<span class="chip-neutral">${count}</span></h3>${html}</section>`;
    const parts = [];
    if ((type === 'all' || type === 'communities') && comms.length) {
      parts.push(section('Comunidades', comms.length, `<div class="grid gap-2 sm:grid-cols-2">${comms.map(c => `
        <a href="/c/${encodeURIComponent(c.name)}" data-link class="card card-hover flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded bg-secondary/10 text-secondary">${UI.icon('tag')}</span>
          <span class="flex-1 font-display text-headline-sm">c/${UI.esc(c.name)}</span>${UI.icon('chevron_right', 'text-ink-muted')}
        </a>`).join('')}</div>`));
    }
    if ((type === 'all' || type === 'users') && users.length) {
      parts.push(section('Usuarios', users.length, `<div class="grid gap-2 sm:grid-cols-2">${users.map(u => `
        <a href="/u/${encodeURIComponent(u.username)}" data-link class="card card-hover flex items-center gap-3">
          ${UI.avatar(u, 40)}<span class="flex-1 text-label-lg">@${UI.esc(u.username)}</span>
          ${window.api.user && window.api.user.username !== u.username ? `<button class="btn-secondary btn-sm" ${UI.on('click.stop.prevent', 'Router.navigate', '/chat/new?to=' + encodeURIComponent(u.username))}>${UI.icon('chat', 'text-[16px]')} Mensaje</button>` : ''}
        </a>`).join('')}</div>`));
    }
    if (type === 'all' || type === 'posts') {
      parts.push(section('Publicaciones', posts.length, posts.length ? `<div class="flex flex-col gap-2">${posts.map(p => `
        <a href="/posts/${encodeURIComponent(p.id)}" data-link class="card card-hover block">
          <div class="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">${UI.communityChip(p.community_name)}<span>@${UI.esc(p.author_username)}</span><span>· ${window.utils.formatTime(p.created_at)}</span><span>· ▲ ${p.net_votes || 0}</span><span>· ${p.comments_count || 0} comentarios</span></div>
          <div class="mt-1.5 font-display text-headline-sm">${this.highlight(p.title)}</div>
          ${p.body_text ? `<p class="mt-1 text-body-sm text-ink-secondary">${this.highlight(p.body_text)}</p>` : ''}
        </a>`).join('')}</div>` : '<p class="card text-body-sm text-ink-muted">Ninguna publicación coincide con los filtros.</p>'));
    }
    box.innerHTML = `<p class="text-body-sm text-ink-muted">${total} resultados para <strong class="text-ink">“${UI.esc(this.q)}”</strong></p>` + parts.join('');
  },

  // Sin búsqueda: tendencias, recientes, comunidades y personas (estilo descubrimiento)
  async renderDiscover() {
    const box = document.getElementById('search-results-container');
    if (!box) return;
    box.innerHTML = UI.skeletonPosts(2);
    const [hot, recent, comms, members] = await Promise.allSettled([
      window.api.listPosts({ sort: 'hot', limit: 6 }),
      window.api.listPosts({ sort: 'newest', limit: 6 }),
      window.api.listCommunities(),
      window.api.listMembers({ sort: 'karma', limit: 8 })
    ]);
    const input = document.getElementById('global-search-input');
    if (!document.getElementById('search-results-container') || (input && input.value.trim().length >= 2)) return;
    const val = r => r.status === 'fulfilled' ? r.value : [];
    const me = window.api.user && window.api.user.username;
    const section = (title, html) => html ? `<section><h3 class="mb-2 text-label-sm uppercase tracking-wider text-ink-muted">${title}</h3>${html}</section>` : '';
    const grid = html => `<div class="grid gap-3 sm:grid-cols-2">${html}</div>`;
    const mini = p => `
      <a href="/posts/${encodeURIComponent(p.id)}" data-link class="card card-hover flex flex-col gap-2">
        <span class="self-start">${UI.communityChip(p.community_name)}</span>
        <span class="font-display text-headline-sm">${UI.esc(p.title)}</span>
        ${p.body_text ? `<span class="line-clamp-2 text-body-sm text-ink-secondary">${UI.esc(UI.excerpt(p.body_text, 140))}</span>` : ''}
        <span class="mt-auto text-body-sm text-ink-muted">@${UI.esc(p.author_username)} · ▲ ${p.net_votes || 0} · ${p.comments_count || 0} comentarios</span>
      </a>`;
    const topComms = val(comms).sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0)).slice(0, 6);
    const people = val(members).filter(u => u.username !== me).slice(0, 8);
    box.innerHTML = [
      section('🔥 Tendencias', val(hot).length ? grid(val(hot).map(mini).join('')) : ''),
      section('🏛️ Comunidades para explorar', topComms.length ? grid(topComms.map(c => `
        <a href="/c/${encodeURIComponent(c.name)}" data-link class="card card-hover"><div class="font-display text-headline-sm">c/${UI.esc(c.name)}</div><div class="mt-1 truncate text-body-sm text-ink-secondary">${UI.esc(c.description || 'Comunidad de Forfunable')}</div><div class="mt-2 font-mono text-body-sm text-ink-muted">${c.subscribers_count || 0} miembros</div></a>`).join('')) : ''),
      section('🆕 Publicado recientemente', val(recent).length ? grid(val(recent).map(mini).join('')) : ''),
      section('👥 Personas destacadas', people.length ? `<div class="flex flex-wrap gap-2">${people.map(u => `
        <a href="/u/${encodeURIComponent(u.username)}" data-link class="card card-hover flex items-center gap-2 py-2">${UI.avatar(u, 28)}<span class="text-label-lg">@${UI.esc(u.username)}</span><span class="font-mono text-body-sm text-primary">${u.karma_score}</span></a>`).join('')}</div>` : '')
    ].join('') || UI.empty({ icon: 'travel_explore', title: 'Aún no hay contenido para explorar' });
  }
};

document.addEventListener('DOMContentLoaded', () => SearchView.attachHeader());
