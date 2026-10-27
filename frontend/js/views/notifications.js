/**
 * Vista: Centro de Notificaciones (Pantalla Stitch 03-20)
 * Conectada a /api/v1/notifications
 */

window.NotificationsView = {
  async render(container) {
    if (!window.api.user) {
      container.innerHTML = `
        <div class="state-empty card">
          <h3>Inicia Sesión</h3>
          <p>Debes estar autenticado para revisar tus alertas y menciones.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/login')">Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md);">
          <h1>🔔 Centro de Notificaciones</h1>
        </div>

        <div id="notifications-list">
          <div class="skeleton-card">
            <div class="skeleton skeleton-text" style="width: 50%;"></div>
            <div class="skeleton skeleton-text" style="width: 80%;"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadNotifications();
  },

  async loadNotifications() {
    const listEl = document.getElementById('notifications-list');
    try {
      const notifs = await window.api.listNotifications();

      if (!notifs || notifs.length === 0) {
        listEl.innerHTML = `
          <div class="state-empty">
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
            </svg>
            <h3>Estás al día</h3>
            <p>No tienes notificaciones pendientes ni menciones recientes.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = notifs.map(n => `
        <div class="card" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${n.is_read ? 'transparent' : 'var(--primary)'}; opacity: ${n.is_read ? '0.7' : '1'};">
          <div>
            <div style="font-size: 14px; color: var(--text-primary); margin-bottom: 4px;">
              ${window.utils.escapeHTML(n.message || n.title || 'Nueva actividad en tu publicación')}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${window.utils.formatTime(n.created_at)}
            </div>
          </div>

          ${!n.is_read ? `
            <button class="btn btn-ghost" style="font-size: 11px;" onclick="NotificationsView.markAsRead('${n.id}')">
              Marcar leída
            </button>
          ` : ''}
        </div>
      `).join('');

    } catch (err) {
      listEl.innerHTML = `
        <div class="state-error">
          <p>No se pudieron recuperar las notificaciones: ${window.utils.escapeHTML(err.message)}</p>
        </div>
      `;
    }
  },

  async markAsRead(notifId) {
    try {
      await window.api.markNotificationRead(notifId);
      await this.loadNotifications();
    } catch (_) {}
  }
};
