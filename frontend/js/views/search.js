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

        <div id="search-results-container">
          <div class="state-empty" style="border: none;">
            <p>Escribe al menos 2 caracteres para explorar hilos indexados, usuarios y comunidades.</p>
          </div>
        </div>
      </div>
    `;
  },

  handleInput(e) {
    const q = e.target.value.trim();
    clearTimeout(this.debounceTimer);

    if (q.length < 2) {
      document.getElementById('search-results-container').innerHTML = `
        <div class="state-empty" style="border: none;">
          <p>Escribe al menos 2 caracteres para iniciar la búsqueda.</p>
        </div>
      `;
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
                  <span>c/${p.community_name || 'general'}</span> • <span>${p.net_votes || 0} puntos</span> • <span>${window.utils.formatTime(p.created_at)}</span>
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
                <span class="chip chip-karma">${u.karma_score || 0} karma</span>
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
