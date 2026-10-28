/**
 * Vista: Centro de Notificaciones (Pantalla Stitch 03-20)
 * Conectada a /api/v1/notifications
 */

window.NotificationsView = {
  onlyUnread: false,
  notifs: [],

  // El tipo indica a dónde lleva la notificación: post:<id>, c:<nombre>, chat, account
  linkFor(type = '') {
    if (type.startsWith('post:')) return `/posts/${type.slice(5)}`;
    if (type.startsWith('c:')) return `/c/${type.slice(2)}`;
    if (type === 'chat') return '/chat';
    if (type === 'account') return '/profile';
    return null;
  },

  iconFor(type = '') {
    if (type.startsWith('post:')) return '💬';
    if (type.startsWith('c:')) return '👥';
    if (type === 'chat') return '✉️';
    if (type === 'account') return '🛡️';
    return '🔔';
  },

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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md); gap: 8px; flex-wrap: wrap;">
          <h1>🔔 Centro de Notificaciones</h1>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary" id="notif-filter-btn" style="font-size: 12px;" onclick="NotificationsView.toggleFilter()">Ver solo no leídas</button>
            <button class="btn btn-primary" style="font-size: 12px;" onclick="NotificationsView.markAllAsRead()">✓ Marcar todas como leídas</button>
          </div>
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
      this.notifs = await window.api.listNotifications();
      const notifs = this.onlyUnread ? this.notifs.filter(n => !n.is_read) : this.notifs;
      const filterBtn = document.getElementById('notif-filter-btn');
      if (filterBtn) filterBtn.textContent = this.onlyUnread ? 'Ver todas' : 'Ver solo no leídas';

      if (!notifs || notifs.length === 0) {
        listEl.innerHTML = `
          <div class="state-empty">
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
            </svg>
            <h3>Estás al día</h3>
            <p>${this.onlyUnread ? 'No tienes notificaciones sin leer.' : 'Aquí verás comentarios y respuestas a tus publicaciones, solicitudes de chat, mensajes, nuevos miembros en tus comunidades y avisos de moderación.'}</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = notifs.map(n => `
        <div class="card" style="margin-bottom: 8px; display: flex; gap: 12px; align-items: center; cursor: ${this.linkFor(n.type) ? 'pointer' : 'default'}; border-left: 3px solid ${n.is_read ? 'transparent' : 'var(--primary)'}; opacity: ${n.is_read ? '0.7' : '1'};" onclick="NotificationsView.open('${n.id}')">
          <div style="font-size: 20px;">${this.iconFor(n.type)}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 2px;">${window.utils.escapeHTML(n.title || 'Notificación')}</div>
            <div style="font-size: 14px; color: var(--text-primary); margin-bottom: 4px;">
              ${window.utils.escapeHTML(n.message || '')}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
              ${window.utils.formatTime(n.created_at)}
            </div>
          </div>

          ${!n.is_read ? `
            <button class="btn btn-ghost" style="font-size: 11px;" onclick="event.stopPropagation(); NotificationsView.markAsRead('${n.id}')">
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
      window.Router.refreshNotifBadge();
    } catch (_) {}
  },

  async markAllAsRead() {
    try {
      await window.api.markAllNotificationsRead();
      await this.loadNotifications();
      window.Router.refreshNotifBadge();
    } catch (err) {
      window.utils.showToast(err.message || 'No se pudieron marcar las notificaciones', 'error');
    }
  },

  toggleFilter() {
    this.onlyUnread = !this.onlyUnread;
    this.loadNotifications();
  },

  // Abrir una notificación la marca como leída y lleva a su contenido
  async open(notifId) {
    const n = this.notifs.find(x => x.id === notifId);
    if (!n) return;
    if (!n.is_read) {
      try { await window.api.markNotificationRead(n.id); } catch (_) {}
      window.Router.refreshNotifBadge();
    }
    const link = this.linkFor(n.type);
    if (link) Router.navigate(link);
    else await this.loadNotifications();
  }
};
