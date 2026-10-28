/**
 * Vista: Comunidad y Gobernanza (Pantalla Stitch 04-24)
 * Conectada a /api/v1/communities/{name}, join y leave
 */

window.CommunityView = {
  currentCommunity: null,

  async render(container, communityName) {
    container.innerHTML = `
      <div id="community-header-container">
        <!-- Loading State -->
        <div class="skeleton-card">
          <div class="skeleton skeleton-title" style="width: 40%;"></div>
          <div class="skeleton skeleton-text" style="width: 80%;"></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-lg); margin-top: var(--space-md);">
        <!-- Columna Principal: Feed de la Comunidad -->
        <div id="community-feed-container"></div>

        <!-- Columna Lateral: Reglas y Gobernanza -->
        <div id="community-sidebar-container">
          <div class="skeleton-card">
            <div class="skeleton skeleton-title" style="width: 60%;"></div>
            <div class="skeleton skeleton-text" style="width: 90%;"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadCommunity(communityName);
  },

  async loadCommunity(communityName) {
    const headerContainer = document.getElementById('community-header-container');
    const feedContainer = document.getElementById('community-feed-container');
    const sidebarContainer = document.getElementById('community-sidebar-container');

    try {
      this.currentCommunity = await window.api.getCommunity(communityName);

      const isSubscribed = this.currentCommunity.is_member || false;

      // Renderizar Header de Comunidad
      headerContainer.innerHTML = `
        <div class="card" style="border-top: 4px solid var(--primary); display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
              <h1>c/${window.utils.escapeHTML(this.currentCommunity.name)}</h1>
              <span class="chip chip-karma">Público</span>
            </div>
            <h4 style="color: var(--text-secondary); margin-bottom: 8px;">
              ${window.utils.escapeHTML(this.currentCommunity.title || this.currentCommunity.name)}
            </h4>
            <p style="color: var(--text-primary); font-size: 14px; max-width: 650px;">
              ${window.utils.escapeHTML(this.currentCommunity.description || 'Comunidad técnica de debate en Forfunable.')}
            </p>
          </div>

          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <button class="btn ${isSubscribed ? 'btn-secondary' : 'btn-primary'}" id="btn-subscribe" onclick="CommunityView.toggleSubscribe('${this.currentCommunity.id}')">
              ${isSubscribed ? '✓ Miembro' : '+ Unirse'}
            </button>
            <span style="font-size: 12px; color: var(--text-muted);">
              👥 <span id="community-members-count">${this.currentCommunity.subscribers_count || 0}</span> miembros
            </span>
          </div>
        </div>
      `;

      // Renderizar Sidebar con Reglas y Gobernanza
      sidebarContainer.innerHTML = `
        <div class="card">
          <h3 style="margin-bottom: var(--space-md); font-size: 16px;">📜 Reglas de la Comunidad</h3>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: var(--space-lg);">
            ${window.utils.renderMarkdown(this.currentCommunity.rules || '1. Mantener el respeto y el rigor técnico.\n2. Prohibido el spam o autopromoción no autorizada.\n3. Código formateado y documentado.')}
          </div>

          <h3 style="margin-bottom: 8px; font-size: 14px;">🛡️ Moderación Activa</h3>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: var(--space-md);">
            Moderado por ${this.currentCommunity.creator_username ? `u/${this.currentCommunity.creator_username}` : 'el equipo técnico'}.
          </p>

          <button class="btn btn-secondary" style="width: 100%;" onclick="Router.navigate('/submit')">
            ✍️ Publicar en c/${this.currentCommunity.name}
          </button>
        </div>
      `;

      // Cargar Feed de la Comunidad
      await window.FeedView.render(feedContainer, communityName);

    } catch (err) {
      headerContainer.innerHTML = `
        <div class="state-error">
          <h3>Comunidad no encontrada (404)</h3>
          <p>${window.utils.escapeHTML(err.message || 'La comunidad solicitada no existe o fue suspendida.')}</p>
          <button class="btn btn-primary" onclick="Router.navigate('/c/create')">Fundar esta Comunidad</button>
        </div>
      `;
    }
  },

  // Vuelve a pedir el conteo real tras unirse/salir y actualiza la barra lateral
  async refreshMembersCount() {
    try {
      const fresh = await window.api.getCommunity(this.currentCommunity.name);
      this.currentCommunity = fresh;
      const countEl = document.getElementById('community-members-count');
      if (countEl) countEl.textContent = fresh.subscribers_count;
      window.Router.loadSidebarCommunities();
    } catch (_) {}
  },

  async toggleSubscribe(communityId) {
    if (!window.api.user) {
      Router.navigate('/login');
      window.utils.showToast('Inicia sesión para suscribirte', 'info');
      return;
    }

    const btn = document.getElementById('btn-subscribe');
    try {
      if (btn.textContent.includes('Miembro')) {
        await window.api.leaveCommunity(communityId);
        btn.textContent = '+ Unirse';
        btn.className = 'btn btn-primary';
        window.utils.showToast('Has salido de la comunidad', 'info');
      } else {
        await window.api.joinCommunity(communityId);
        btn.textContent = '✓ Miembro';
        btn.className = 'btn btn-secondary';
        window.utils.showToast('¡Te has unido a la comunidad!', 'info');
      }
      await this.refreshMembersCount();
    } catch (err) {
      window.utils.showToast(err.message || 'Error en la suscripción', 'error');
    }
  }
};
