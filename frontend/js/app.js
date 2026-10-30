/**
 * App Router & Shell Manager — Forfunable Frontend
 * Orquestador principal de navegación SPA y renderizado de vistas
 */

window.Router = {
  routes: {},

  init() {
    window.addEventListener('popstate', () => this.handleRoute());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-link]');
      if (link) {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
      }
    });

    // Auto-login inicial intentando refresh token
    window.api.refreshToken().finally(() => {
      this.handleRoute();
    });

    // Contador de notificaciones sin leer en la barra lateral
    setInterval(() => this.refreshNotifBadge(), 30000);
  },

  navigate(path) {
    window.history.pushState(null, null, path);
    this.handleRoute();
  },

  async handleRoute() {
    const path = window.location.pathname;
    const mainContainer = document.getElementById('main-view-container');
    if (!mainContainer) return;

    // Actualizar Navbar de acuerdo al estado de sesión
    this.updateNavbar();

    // Login y registro se muestran solos, sin el resto de la interfaz
    document.body.classList.toggle('auth-mode', path === '/login' || path === '/register');

    // Enrutamiento Dinámico
    if (path === '/' || path === '') {
      await window.FeedView.render(mainContainer);
    } else if (path.startsWith('/c/create')) {
      window.CreateCommunityView.render(mainContainer);
    } else if (path.startsWith('/c/')) {
      const commName = path.split('/')[2];
      await window.CommunityView.render(mainContainer, commName);
    } else if (path.startsWith('/posts/')) {
      const postId = path.split('/')[2];
      await window.PostDetailView.render(mainContainer, postId);
    } else if (path === '/submit') {
      await window.CreatePostView.render(mainContainer);
    } else if (path === '/login') {
      window.AuthView.render(mainContainer, 'login');
    } else if (path === '/register') {
      window.AuthView.render(mainContainer, 'register');
    } else if (path.startsWith('/u/')) {
      const username = path.split('/')[2];
      await window.ProfileView.render(mainContainer, username);
    } else if (path === '/profile') {
      await window.ProfileView.render(mainContainer);
    } else if (path === '/notifications') {
      await window.NotificationsView.render(mainContainer);
    } else if (path === '/search') {
      window.SearchView.render(mainContainer);
    } else if (path === '/chat') {
      await window.ChatView.render(mainContainer);
    } else if (path === '/admin') {
      await window.AdminView.render(mainContainer);
    } else {
      // 404 Route (Pantalla Stitch 06-77)
      mainContainer.innerHTML = `
        <div class="state-empty card" style="max-width: 600px; margin: 40px auto;">
          <h2 style="margin-bottom: 8px;">404 — Ruta no encontrada</h2>
          <p>La vista que intentas acceder no está definida en la matriz de enrutamiento.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/')">Volver al Feed Principal</button>
        </div>
      `;
    }

    // Cargar listas del sidebar
    this.loadSidebarCommunities();
    this.refreshNotifBadge();
  },

  async refreshNotifBadge() {
    const badge = document.getElementById('nav-notif-badge');
    if (!badge) return;
    if (!window.api.user) {
      badge.style.display = 'none';
      return;
    }
    try {
      const unread = (await window.api.listNotifications()).filter(n => !n.is_read).length;
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    } catch (_) {}
  },

  updateNavbar() {
    const authActions = document.getElementById('navbar-auth-actions');
    if (!authActions) return;

    if (window.api.user) {
      authActions.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <!-- Karma Counter -->
          <div class="chip chip-karma" style="cursor: pointer;" onclick="Router.navigate('/profile')">
            ⚡ <span id="nav-karma">${window.api.user.karma_score || 0}</span> karma
          </div>

          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="Router.navigate('/submit')">
            + Publicar
          </button>

          <!-- Avatar & Menu -->
          <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="Router.navigate('/profile')">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--surface-subtle); display: flex; align-items: center; justify-content: center; font-size: 14px; border: 1px solid var(--border-subtle);">
              👨‍💻
            </div>
            <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">u/${window.utils.escapeHTML(window.api.user.username)}</span>
          </div>

          <button class="btn btn-ghost" style="padding: 6px 10px; font-size: 12px;" onclick="window.api.logout().then(() => Router.navigate('/login'))">
            Salir
          </button>
        </div>
      `;
    } else {
      authActions.innerHTML = `
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="Router.navigate('/login')">Ingresar</button>
          <button class="btn btn-primary" onclick="Router.navigate('/register')">Registrarse</button>
        </div>
      `;
    }
  },

  async loadSidebarCommunities() {
    const sidebarList = document.getElementById('sidebar-communities-list');
    if (!sidebarList) return;

    try {
      const comms = await window.api.listCommunities();
      if (comms && comms.length > 0) {
        sidebarList.innerHTML = comms.slice(0, 8).map(c => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: var(--radius-md); cursor: pointer; transition: background 150ms ease;" class="sidebar-item" onclick="Router.navigate('/c/${c.name}')">
            <span style="font-size: 13px; color: var(--text-primary); font-weight: 500;">c/${window.utils.escapeHTML(c.name)}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${c.subscribers_count || 0}</span>
          </div>
        `).join('');
      } else {
        sidebarList.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">Sin comunidades aún</span>`;
      }
    } catch (_) {}
  }
};

// Inicializar la aplicación al cargar DOM
document.addEventListener('DOMContentLoaded', () => {
  window.Router.init();
});
