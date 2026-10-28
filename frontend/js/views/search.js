/**
 * Vista: Búsqueda Predictiva y Explorador de Hilos (Pantalla Stitch 03-23)
 * Conectada a /api/v1/search/predictive
 */

window.SearchView = {
  debounceTimer: null,

  render(container) {
    container.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto;">
        <h1 style="margin-bottom: var(--space-md);">🔍 Explorador Global</h1>

        <div class="card" style="margin-bottom: var(--space-lg); padding: var(--space-sm);">
          <input type="text" id="global-search-input" class="form-input" placeholder="Buscar por palabra clave, etiquetas, comunidad (c/...) o usuario (u/...)" oninput="SearchView.handleInput(event)" autofocus style="border: none; font-size: 16px; background: transparent;">
        </div>

        <div id="search-results-container"></div>
      </div>
    `;
    this.renderDiscover();
  },

  // Contenido de descubrimiento mientras no hay búsqueda (tendencias, recientes, comunidades, personas)
  async renderDiscover() {
    const container = document.getElementById('search-results-container');
    if (!container) return;
    const skeleton = `
      <div class="skeleton-card"><div class="skeleton skeleton-title" style="width: 40%;"></div><div class="skeleton skeleton-text" style="width: 80%;"></div></div>`;
    container.innerHTML = skeleton + skeleton;

    const [hot, recent, comms] = await Promise.allSettled([
      window.api.getFeed('hot', 6),
      window.api.listPosts({ sort: 'newest', limit: 6 }),
      window.api.listCommunities()
    ]);
    // El usuario pudo empezar a escribir mientras cargaba
    const input = document.getElementById('global-search-input');
    if (!document.getElementById('search-results-container') || (input && input.value.trim().length >= 2)) return;

    const hotPosts = hot.status === 'fulfilled' ? hot.value.slice(0, 6) : [];
    const recentPosts = recent.status === 'fulfilled' ? recent.value.slice(0, 6) : [];
    const communities = comms.status === 'fulfilled'
      ? [...comms.value].sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0)).slice(0, 6)
      : [];
    const me = window.api.user && window.api.user.username;
    const people = [...new Set([...recentPosts, ...hotPosts].map(p => p.author_username).filter(u => u && u !== me))].slice(0, 8);

    const section = (title, body) => body ? `
      <h3 style="margin: var(--space-lg) 0 8px; font-size: 14px; color: var(--text-secondary);">${title}</h3>${body}` : '';
    const grid = items => `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px;">${items}</div>`;
    const postCard = p => `
      <div class="card" style="cursor: pointer; display: flex; flex-direction: column; gap: 6px; margin: 0;" onclick="Router.navigate('/posts/${p.id}')">
        <span class="chip" style="align-self: flex-start;">c/${window.utils.escapeHTML(p.community_name || 'general')}</span>
        <div style="font-weight: 600; color: var(--text-primary);">${window.utils.escapeHTML(p.title)}</div>
        ${p.body_text ? `<div style="font-size: 12px; color: var(--text-secondary); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${window.utils.escapeHTML(p.body_text)}</div>` : ''}
        <div style="font-size: 11px; color: var(--text-muted); margin-top: auto;">u/${window.utils.escapeHTML(p.author_username || 'anónimo')} • ▲ ${p.net_votes || 0} • 💬 ${p.comments_count || 0} • ${window.utils.formatTime(p.created_at)}</div>
      </div>`;

    container.innerHTML = [
      section('🔥 TENDENCIAS', hotPosts.length ? grid(hotPosts.map(postCard).join('')) : ''),
      section('🏛️ COMUNIDADES PARA EXPLORAR', communities.length ? grid(communities.map(c => `
        <div class="card" style="cursor: pointer; margin: 0;" onclick="Router.navigate('/c/${c.name}')">
          <div style="font-weight: 600; color: var(--text-primary);">c/${window.utils.escapeHTML(c.name)}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin: 4px 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${window.utils.escapeHTML(c.description || 'Comunidad de Forfunable')}</div>
          <div style="font-size: 11px; color: var(--text-muted);">👥 ${c.subscribers_count || 0} miembros</div>
        </div>`).join('')) : ''),
      section('🆕 PUBLICADO RECIENTEMENTE', recentPosts.length ? grid(recentPosts.map(postCard).join('')) : ''),
      section('👥 PERSONAS ACTIVAS', people.length ? `<div style="display: flex; flex-wrap: wrap; gap: 8px;">${people.map(u => `
        <div class="card" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin: 0;">
          <span style="cursor: pointer; font-weight: 600;" onclick="Router.navigate('/u/${u}')">u/${window.utils.escapeHTML(u)}</span>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="ChatView.requestChat('${u}')">💬 Mensaje</button>
        </div>`).join('')}</div>` : '')
    ].join('') || `
      <div class="state-empty" style="border: none;">
        <p>Aún no hay contenido para explorar. ¡Crea la primera comunidad o publicación!</p>
      </div>`;
  },

  handleInput(e) {
    const q = e.target.value.trim();
    clearTimeout(this.debounceTimer);

    if (q.length < 2) {
      this.renderDiscover();
      return;
    }

    this.debounceTimer = setTimeout(() => this.executeSearch(q), 200);
  },

  async executeSearch(query) {
    const container = document.getElementById('search-results-container');
    container.innerHTML = `
      <div class="skeleton-card">
        <div class="skeleton skeleton-title" style="width: 40%;"></div>
        <div class="skeleton skeleton-text" style="width: 80%;"></div>
      </div>
    `;

    try {
      const results = await window.api.predictiveSearch(query);

      const communities = results.communities || [];
      const posts = results.posts || [];
      const users = results.users || [];

      if (communities.length === 0 && posts.length === 0 && users.length === 0) {
        container.innerHTML = `
          <div class="state-empty">
            <p>No se encontraron resultados para "<strong>${window.utils.escapeHTML(query)}</strong>".</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        ${communities.length > 0 ? `
          <h3 style="margin-bottom: 8px; font-size: 14px; color: var(--text-secondary);">COMUNIDADES</h3>
          <div style="display: grid; gap: 8px; margin-bottom: var(--space-lg);">
            ${communities.map(c => `
              <div class="card" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="Router.navigate('/c/${c.name}')">
                <div>
                  <div style="font-weight: 600; color: var(--text-primary);">c/${window.utils.escapeHTML(c.name)}</div>
                  <div style="font-size: 12px; color: var(--text-muted);">${window.utils.escapeHTML(c.title || '')}</div>
                </div>
                <span class="chip">Ver foro</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${posts.length > 0 ? `
          <h3 style="margin-bottom: 8px; font-size: 14px; color: var(--text-secondary);">PUBLICACIONES</h3>
          <div style="display: grid; gap: 8px; margin-bottom: var(--space-lg);">
            ${posts.map(p => `
              <div class="card" style="cursor: pointer;" onclick="Router.navigate('/posts/${p.id}')">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${window.utils.escapeHTML(p.title)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                  <span>Ver publicación →</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${users.length > 0 ? `
          <h3 style="margin-bottom: 8px; font-size: 14px; color: var(--text-secondary);">USUARIOS</h3>
          <div style="display: grid; gap: 8px;">
            ${users.map(u => `
              <div class="card" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="Router.navigate('/u/${u.username}')">
                <div style="font-weight: 600;">u/${window.utils.escapeHTML(u.username)}</div>
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="event.stopPropagation(); ChatView.requestChat('${u.username}')">💬 Mensaje</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;

    } catch (err) {
      container.innerHTML = `
        <div class="state-error">
          <p>Error en la búsqueda predictiva: ${window.utils.escapeHTML(err.message)}</p>
        </div>
      `;
    }
  }
};
