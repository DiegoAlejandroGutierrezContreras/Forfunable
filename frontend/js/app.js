/**
 * Router SPA y estructura de la página (barra superior, menú lateral, columna derecha).
 * Cada ruta define su vista, su layout ('default' con columna derecha, 'wide' sin ella,
 * 'full' a pantalla completa) y opcionalmente un rail propio.
 */

window.Router = {
  routes: [],

  define() {
    const r = (pattern, view, opts = {}) => this.routes.push({ pattern, view, ...opts });
    // Etapa 1: acceso, feed y publicaciones
    r('/', p => FeedView.render(p));
    r('/login', () => AuthView.render('login'), { layout: 'full' });
    r('/register', () => AuthView.render('register'), { layout: 'full' });
    r('/welcome', () => AuthView.welcome(), { layout: 'full', auth: true });
    r('/onboarding', () => AuthView.onboarding(), { layout: 'full', auth: true });
    r('/submit', (p, q) => CreatePostView.render(q), { layout: 'wide', auth: true });
    r('/posts/:id/edit', p => CreatePostView.edit(p.id), { layout: 'wide', auth: true });
    r('/posts/:id/history', (p, q) => HistoryView.render(p.id, q), { layout: 'wide' });
    r('/posts/:id', p => PostDetailView.render(p.id));
    // Etapa 2: comunidades, búsqueda, miembros y perfil
    r('/communities', (p, q) => CommunityView.explore(q));
    r('/c/create', () => CreateCommunityView.render(), { auth: true });
    r('/c/:name/rules', p => CommunityView.rules(p.name));
    r('/c/:name/settings', p => CommunityAdminView.settings(p.name), { auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    r('/c/:name/moderators', p => CommunityAdminView.moderators(p.name), { auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    r('/c/:name/bans', p => CommunityAdminView.bans(p.name), { auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    // Funciones extendidas: el permiso (fundador o moderador local) lo comprueba la vista y el servidor
    r('/c/:name/flairs', p => CommunityExtras.flairs(p.name), { auth: true });
    r('/c/:name/requests', (p, q) => CommunityExtras.requests(p.name, q), { auth: true });
    r('/c/:name/ownership', p => CommunityExtras.ownership(p.name), { auth: true });
    r('/c/:name', (p, q) => CommunityView.render(p.name, q));
    r('/search', (p, q) => SearchView.render(q));
    r('/members', (p, q) => MembersView.render(q));
    r('/profile', () => ProfileView.render(null), { auth: true });
    r('/u/:name', p => ProfileView.render(p.name));
    r('/saved', (p, q) => SavedView.render(q), { layout: 'wide', auth: true });
    r('/requests', () => CommunityExtras.myRequests(), { auth: true });
    r('/appeals', (p, q) => AppealsView.render(q), { layout: 'wide', auth: true });
    r('/account/deletion', () => AccountView.deletion(), { layout: 'wide' });
    r('/settings', () => SettingsView.render('home'), { layout: 'wide', auth: true });
    r('/settings/:section', p => SettingsView.render(p.section), { layout: 'wide', auth: true });
    // Etapa 3: chat, notificaciones, moderación y administración
    r('/notifications', (p, q) => NotificationsView.render(q), { auth: true });
    r('/chat/requests', () => ChatView.requests(), { layout: 'wide', auth: true });
    r('/chat/new', (p, q) => ChatView.compose(q), { layout: 'wide', auth: true });
    r('/chat/:id', p => ChatView.render(p.id), { layout: 'wide', auth: true });
    r('/chat', () => ChatView.render(null), { layout: 'wide', auth: true });
    r('/reports/:id', p => ModerationView.reportReceipt(p.id), { auth: true });
    r('/notice/:id', p => ModerationView.notice(p.id), { auth: true });
    r('/admin/reports', () => AdminView.render('reports'), { layout: 'wide', auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    r('/admin/:tab', p => AdminView.render(p.tab), { layout: 'wide', auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    r('/admin', () => AdminView.render('metrics'), { layout: 'wide', auth: true, roles: ['COMMUNITY_MOD', 'GLOBAL_ADMIN'] });
    // Etapa 4: estado del servicio y errores
    r('/status', () => StatusView.service(), { layout: 'wide' });
    r('/error/:code', p => StatusView.page(p.code), { layout: 'wide' });
  },

  init() {
    this.define();
    window.addEventListener('popstate', () => this.handleRoute());
    document.addEventListener('click', e => {
      const link = e.target.closest('a[data-link]');
      if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && link.target !== '_blank') {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
      }
    });
    // Ctrl + K enfoca el buscador
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('header-search');
        if (input && input.offsetParent) input.focus(); else this.navigate('/search');
      }
    });

    window.api.onAuthChange(() => { this.updateNavbar(); this.updateSidebar(); });
    window.api.refreshToken().finally(() => this.handleRoute());
    setInterval(() => this.refreshBadges(), 30000);
    if (window.StatusView && StatusView.init) StatusView.init();
  },

  // Una vista con cambios sin guardar puede pedir confirmación antes de salir (06_87)
  leaveGuard: null,

  async navigate(path, { replace = false } = {}) {
    if (this.leaveGuard && !(await this.leaveGuard())) return;
    this.leaveGuard = null;
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    this.handleRoute();
  },

  match(path) {
    for (const route of this.routes) {
      const names = [];
      const re = new RegExp('^' + route.pattern.replace(/:[a-zA-Z]+/g, m => { names.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
      const m = path.match(re);
      if (m) {
        const params = {};
        names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
    }
    return null;
  },

  setLayout(layout) {
    const full = layout === 'full';
    document.body.classList.toggle('auth-mode', full);
    document.getElementById('app-header').classList.toggle('hidden', full);
    document.getElementById('app-sidebar').classList.toggle('lg:block', !full);
    document.getElementById('app-rail').classList.toggle('xl:flex', layout === 'default');
    const box = document.getElementById('layout');
    box.className = full
      ? 'mx-auto flex min-h-screen max-w-[1140px] items-center justify-center px-4 py-8'
      : `mx-auto flex ${layout === 'wide' ? 'max-w-[1240px]' : 'max-w-[1140px]'} items-start gap-5 px-4 py-4 lg:px-6`;
    this.toggleSidebar(false);
  },

  async handleRoute() {
    const path = window.location.pathname;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    const main = document.getElementById('main-view-container');
    const found = this.match(path);

    this.updateNavbar();
    this.updateSidebar(path);
    window.scrollTo(0, 0);

    if (!found) {
      this.setLayout('wide');
      return StatusView.page('404', { path });
    }
    const { route, params } = found;

    // Rutas protegidas: modal de autenticación (06_72) o acceso denegado (05_47)
    if (route.auth && !window.api.user) {
      this.setLayout('wide');
      main.innerHTML = '';
      return StatusView.requireAuth(path);
    }
    if (route.roles && !route.roles.includes(window.api.user.global_role)) {
      this.setLayout('wide');
      return StatusView.page('403', { path });
    }

    this.setLayout(route.layout || 'default');
    main.innerHTML = '';
    if ((route.layout || 'default') === 'default') this.renderRail(route.rail);
    try {
      if (await AccountView.checkPending(path)) return;
      if (window.api.user) await window.api.savedIds();
      await route.view(params, query);
    } catch (err) {
      console.error('[Router]', err);
      StatusView.fromError(err, () => this.handleRoute());
    }
  },

  // Columna derecha por defecto: reputación, comunidades recomendadas y pie
  async renderRail(custom) {
    const rail = document.getElementById('app-rail');
    rail.innerHTML = UI.rail.reputation(window.api.user) + '<div id="rail-extra" class="flex flex-col gap-4"></div>' + UI.rail.footer();
    const extra = custom ? await custom() : await UI.rail.recommended();
    const slot = document.getElementById('rail-extra');
    if (slot) slot.innerHTML = extra || '';
  },

  // Permite a una vista reemplazar el bloque intermedio de la columna derecha
  setRail(html) {
    const slot = document.getElementById('rail-extra');
    if (slot) slot.innerHTML = html;
  },

  toggleSidebar(force) {
    const sidebar = document.getElementById('app-sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    const open = force === undefined ? sidebar.classList.contains('hidden') : force;
    sidebar.classList.toggle('hidden', !open);
    scrim.classList.toggle('hidden', !open);
  },

  updateNavbar() {
    const box = document.getElementById('navbar-auth-actions');
    if (!box) return;
    const user = window.api.user;
    if (!user) {
      box.innerHTML = `
        <a href="/login" data-link class="btn-secondary btn-sm">Ingresar</a>
        <a href="/register" data-link class="btn-primary btn-sm">Registrarse</a>`;
      return;
    }
    box.innerHTML = `
      <div class="relative">
        <button class="btn-primary btn-sm" ${UI.on('click', 'Router.toggleMenu', 'create-menu')}>${UI.icon('add', 'text-[18px]')}<span class="hidden sm:inline">Crear</span>${UI.icon('expand_more', 'text-[16px]')}</button>
        <div id="create-menu" class="panel absolute right-0 top-full z-50 mt-2 hidden w-52 p-1.5">
          <a href="/submit" data-link class="nav-item">${UI.icon('edit_note', 'text-[19px]')}Publicación</a>
          <a href="/c/create" data-link class="nav-item">${UI.icon('group_add', 'text-[19px]')}Comunidad</a>
          <a href="/chat/new" data-link class="nav-item">${UI.icon('forum', 'text-[19px]')}Mensaje privado</a>
        </div>
      </div>
      <a href="/chat" data-link class="btn-icon relative" title="Mensajes">${UI.icon('chat_bubble_outline')}<span id="hdr-chat-badge" class="absolute right-0.5 top-0.5 hidden min-w-[16px] rounded-full bg-secondary px-1 text-center text-[10px] font-bold leading-4 text-primary-ink"></span></a>
      <a href="/notifications" data-link class="btn-icon relative" title="Notificaciones">${UI.icon('notifications')}<span id="hdr-notif-badge" class="absolute right-0.5 top-0.5 hidden min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white"></span></a>
      <div class="relative">
        <button class="ml-1 flex items-center rounded-full" ${UI.on('click', 'Router.toggleMenu', 'user-menu')} aria-label="Menú de usuario">${UI.avatar(user, 32)}</button>
        <div id="user-menu" class="panel absolute right-0 top-full z-50 mt-2 hidden w-60 p-1.5">
          <div class="flex items-center gap-3 border-b border-line px-3 pb-3 pt-1.5">
            ${UI.avatar(user, 36)}
            <div class="min-w-0"><div class="truncate text-label-lg">@${UI.esc(user.username)}</div><div class="font-mono text-body-sm text-primary">${user.karma_score || 0} karma</div></div>
          </div>
          <div class="pt-1.5">
            <a href="/profile" data-link class="nav-item">${UI.icon('person', 'text-[19px]')}Mi perfil</a>
            <a href="/saved" data-link class="nav-item">${UI.icon('bookmarks', 'text-[19px]')}Guardados</a>
            <a href="/settings" data-link class="nav-item">${UI.icon('settings', 'text-[19px]')}Ajustes</a>
            <button class="nav-item w-full text-danger hover:text-danger" ${UI.on('click', 'Router.logout')}>${UI.icon('logout', 'text-[19px]')}Cerrar sesión</button>
          </div>
        </div>
      </div>`;
    this.refreshBadges();
  },

  headerSearch(form) { this.navigate('/search?q=' + encodeURIComponent(form.q.value.trim())); },

  toggleMenu(id) {
    ['create-menu', 'user-menu'].forEach(m => {
      const el = document.getElementById(m);
      if (el) el.classList.toggle('hidden', m !== id || !el.classList.contains('hidden'));
    });
    const close = e => {
      if (!e.target.closest('#create-menu, #user-menu, [data-on-click="Router.toggleMenu"]')) {
        ['create-menu', 'user-menu'].forEach(m => document.getElementById(m)?.classList.add('hidden'));
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  async logout() {
    try { await window.api.logout(); } catch (_) {}
    window.utils.showToast('Sesión cerrada', 'info');
    this.navigate('/');
  },

  updateSidebar(path = window.location.pathname) {
    document.querySelectorAll('[data-nav]').forEach(a => {
      const nav = a.getAttribute('data-nav');
      a.classList.toggle('active', nav === '/' ? path === '/' : path === nav || (nav !== '/admin' && path.startsWith(nav + '/')));
    });
    const role = window.api.user && window.api.user.global_role;
    const admin = document.getElementById('sidebar-admin');
    admin.classList.toggle('hidden', !['COMMUNITY_MOD', 'GLOBAL_ADMIN'].includes(role));
    admin.classList.toggle('flex', ['COMMUNITY_MOD', 'GLOBAL_ADMIN'].includes(role));
    if (!this._communitiesLoaded) this.loadSidebarCommunities();
  },

  async loadSidebarCommunities() {
    const list = document.getElementById('sidebar-communities-list');
    if (!list) return;
    this._communitiesLoaded = true;
    const dots = ['bg-secondary', 'bg-tertiary-soft', 'bg-primary', 'bg-warning', 'bg-danger'];
    try {
      const comms = await window.api.listCommunities();
      list.innerHTML = comms.length
        ? comms.slice(0, 8).map((c, i) => `
            <a href="/c/${encodeURIComponent(c.name)}" data-link data-nav="/c/${UI.esc(c.name)}" class="nav-item justify-between py-1.5 text-body-sm">
              <span class="flex min-w-0 items-center gap-3"><span class="h-2 w-2 shrink-0 rounded-full ${dots[i % dots.length]}"></span><span class="truncate">c/${UI.esc(c.name)}</span></span>
              <span class="font-mono text-label-sm text-ink-muted">${c.subscribers_count || 0}</span>
            </a>`).join('') + `<a href="/communities" data-link class="nav-item py-1.5 text-body-sm text-ink-muted">${UI.icon('more_horiz', 'text-[18px]')}Ver todas</a>`
        : `<a href="/c/create" data-link class="nav-item py-1.5 text-body-sm">${UI.icon('add', 'text-[18px]')}Crear la primera</a>`;
      this.updateSidebar();
    } catch (_) {
      list.innerHTML = '';
    }
  },

  // Contadores de notificaciones sin leer y solicitudes de chat pendientes
  async refreshBadges() {
    const set = (ids, n) => ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n > 99 ? '99+' : n;
      el.classList.toggle('hidden', !n);
    });
    if (!window.api.user) { set(['nav-notif-badge', 'hdr-notif-badge', 'nav-chat-badge', 'hdr-chat-badge'], 0); return; }
    try {
      const notifs = await window.api.listNotifications();
      set(['nav-notif-badge', 'hdr-notif-badge'], notifs.filter(n => !n.is_read).length);
    } catch (_) {}
    try {
      const reqs = await window.api.listChatRequests();
      set(['nav-chat-badge', 'hdr-chat-badge'], reqs.length);
    } catch (_) {}
  },

  // Compatibilidad con vistas anteriores
  refreshNotifBadge() { return this.refreshBadges(); }
};

document.addEventListener('DOMContentLoaded', () => Router.init());
