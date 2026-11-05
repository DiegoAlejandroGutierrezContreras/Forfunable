/**
 * Estados del sistema y errores (Etapa 4):
 * 05_47 403 · 05_48 404 recurso · 06_77 404 ruta · 06_75 comunidad no encontrada · 05_49 409 · 05_51 500 ·
 * 06_56 502 con diagnóstico · 06_47 sin conexión · 06_53 conexión lenta y modo ligero · 06_59 mantenimiento ·
 * 06_82 solo lectura · 06_61/06_62 reintentos con backoff · 06_64 429 · 06_65/06_69 bloqueo preventivo ·
 * 06_66 anti-bots · 06_67 votando muy rápido · 06_68 límite de publicaciones · 06_70 sesión expirada ·
 * 06_71 sesión no válida · 06_72 requerir autenticación · 06_73 cuenta suspendida · 06_76 comunidad restringida ·
 * 06_78 cuarentena · 06_81 suspensión local · 06_58 estado del servicio.
 */

window.StatusView = {
  LITE_KEY: 'forfunable_lite_mode',

  pages: {
    '403': { tone: 'danger', icon: 'gpp_maybe', tag: 'Error 403 · Restricción de autorización', title: 'Acceso restringido', text: 'No tienes los permisos ni el rol necesario para esta sección.' },
    '404': { tone: 'secondary', icon: 'travel_explore', tag: 'Error 404 · Recurso no encontrado', title: 'No encontramos lo que buscas', text: 'El contenido no existe, fue eliminado o el enlace está mal escrito.' },
    'route': { tone: 'secondary', icon: 'wrong_location', tag: 'Error 404 · Ruta desconocida', title: 'Página no encontrada', text: 'Esta dirección no corresponde a ninguna sección de Forfunable.' },
    'community-404': { tone: 'secondary', icon: 'group_off', tag: 'Comunidad inexistente', title: 'Esta comunidad no existe', text: 'Puede que el nombre esté mal escrito o que todavía nadie la haya fundado.' },
    '409': { tone: 'warning', icon: 'merge_type', tag: 'Error 409 · Conflicto', title: 'Hubo un conflicto con los datos', text: 'Lo que intentaste guardar choca con información que ya existe o que cambió mientras editabas.' },
    '500': { tone: 'danger', icon: 'dns', tag: 'Error 500 · Fallo interno', title: 'Algo falló en el servidor', text: 'El error quedó registrado. Puedes reintentar en unos segundos; tus datos no se perdieron.' },
    '502': { tone: 'danger', icon: 'cloud_off', tag: 'Error 502 · Sin respuesta del servidor', title: 'No pudimos conectar con el servidor', text: 'Reintentamos varias veces sin éxito. Revisa el diagnóstico de abajo.' },
    'offline': { tone: 'warning', icon: 'wifi_off', tag: 'Sin conexión', title: 'Sin conexión a internet', text: 'Tu dispositivo perdió la conexión. Volveremos a cargar en cuanto se recupere.' },
    'maintenance': { tone: 'warning', icon: 'construction', tag: 'Mantenimiento', title: 'Estamos en mantenimiento', text: 'La base de datos no está disponible en este momento. La lectura y la escritura se reanudarán en breve.' },
    '429': { tone: 'warning', icon: 'speed', tag: 'Error 429 · Límite de peticiones', title: 'Demasiadas peticiones', text: 'Superaste el límite de solicitudes por minuto. Espera un momento antes de continuar.' },
    'lockout': { tone: 'danger', icon: 'lock_clock', tag: 'Bloqueo temporal por seguridad', title: 'Pausa de seguridad', text: 'Detectamos varios intentos de inicio de sesión fallidos. Por seguridad, espera unos minutos antes de volver a intentarlo.' },
    'antibot': { tone: 'danger', icon: 'smart_toy', tag: 'Verificación anti-bots fallida', title: 'No pudimos verificar que eres humano', text: 'reCAPTCHA rechazó la solicitud. Recarga la página, desactiva extensiones que bloqueen scripts y vuelve a intentarlo.' },
    'post-limit': { tone: 'warning', icon: 'timer_pause', tag: 'Límite de publicaciones', title: 'Toma una pausa', text: 'Publicaste mucho en poco tiempo. Espera unos minutos para volver a publicar; así protegemos a la comunidad del spam.' },
    'suspended': { tone: 'danger', icon: 'person_off', tag: 'Cuenta suspendida', title: 'Tu cuenta está suspendida', text: 'Un administrador restringió el acceso a esta cuenta.' },
    'community-restricted': { tone: 'warning', icon: 'lock', tag: 'Comunidad privada', title: 'Comunidad restringida', text: 'Solo sus miembros pueden ver el contenido de esta comunidad.' },
    'session-invalid': { tone: 'danger', icon: 'key_off', tag: 'Sesión no válida', title: 'Tu sesión no es válida', text: 'El token de sesión fue rechazado (pudo ser revocado o modificado). Vuelve a iniciar sesión.' }
  },

  init() {
    window.addEventListener('offline', () => this.banner('offline'));
    window.addEventListener('online', () => { this.clearBanner('offline'); window.utils.showToast('Conexión restablecida', 'info'); });
    if (!navigator.onLine) this.banner('offline');
    const conn = navigator.connection;
    const checkSlow = () => {
      if (conn && (conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType)) && !this.isLite()) this.banner('slow');
    };
    if (conn) { conn.addEventListener?.('change', checkSlow); checkSlow(); }
    if (this.isLite()) document.body.classList.add('lite-mode');
    this.checkHealth();
    setInterval(() => this.checkHealth(), 60000);
  },

  // 06_82 / 06_59: si la base de datos no responde, aviso de solo lectura
  async checkHealth() {
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      const data = await res.json();
      this.health = data;
      if (data.database !== 'CONNECTED') this.banner('readonly'); else this.clearBanner('readonly');
    } catch (_) {}
  },

  isLite() {
    try { return localStorage.getItem(this.LITE_KEY) === '1'; } catch (_) { return false; }
  },

  // 06_53 Modo de conexión restringida y bajo consumo de datos
  setLite(on) {
    try { localStorage.setItem(this.LITE_KEY, on ? '1' : '0'); } catch (_) {}
    document.body.classList.toggle('lite-mode', on);
    this.clearBanner('slow');
    window.utils.showToast(on ? 'Modo ligero activado: no se cargan imágenes' : 'Modo ligero desactivado', 'info');
  },

  banners: {
    offline: { cls: 'bg-warning text-primary-ink', icon: 'wifi_off', text: 'Sin conexión a internet. Lo que ves puede estar desactualizado.' },
    slow: { cls: 'bg-surface-elevated text-ink border-b border-line', icon: 'network_check', text: 'Tu conexión es lenta. ¿Activar el modo ligero (sin imágenes)?', action: `<button class="btn-primary btn-sm" ${UI.on('click', 'StatusView.setLite', true)}>Activar</button><button class="btn-ghost btn-sm" ${UI.on('click', 'StatusView.clearBanner', 'slow')}>Ahora no</button>` },
    readonly: { cls: 'bg-warning/90 text-primary-ink', icon: 'edit_off', text: 'Modo solo lectura: la base de datos no responde. Publicar y votar puede fallar hasta que se restablezca.', action: `<a href="/status" data-link class="btn btn-sm bg-primary-ink/20 text-primary-ink">Ver estado</a>` },
    retry: { cls: 'bg-surface-elevated text-ink border-b border-line', icon: 'sync', text: '' }
  },

  banner(id, text) {
    const host = document.getElementById('global-banners');
    if (!host) return;
    const b = this.banners[id];
    let el = document.getElementById(`banner-${id}`);
    if (!el) {
      el = document.createElement('div');
      el.id = `banner-${id}`;
      host.appendChild(el);
    }
    el.className = `flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-body-sm ${b.cls}`;
    el.innerHTML = `${UI.icon(b.icon, `text-[18px] ${id === 'retry' ? 'animate-spin' : ''}`)}<span>${UI.esc(text || b.text)}</span>${b.action || ''}`;
  },

  clearBanner(id) {
    document.getElementById(`banner-${id}`)?.remove();
  },

  // 06_62 Reconexión automática con backoff exponencial (llamado desde api.request)
  retrying(attempt, delayMs) {
    this.banner('retry', `Reconectando con el servidor… intento ${attempt} (siguiente en ${Math.round(delayMs / 1000)} s)`);
  },
  toggleLite(el) { this.setLite(!this.isLite()); el.classList.toggle('on', this.isLite()); },

  runRetry() { return this._retry ? this._retry() : Router.handleRoute(); },
  leave() { UI.closeModal(); Router.navigate('/'); },

  retryDone() { this.clearBanner('retry'); },

  // Página de estado/error genérica a pantalla de contenido
  page(code, opts = {}) {
    let key = String(code);
    if (key === '404' && opts.what === 'route') key = 'route';
    if (key === '404' && !opts.what && opts.path) key = 'route';
    const p = this.pages[key] || this.pages['500'];
    const tone = { danger: ['text-danger', 'bg-danger/10', 'border-danger/30'], warning: ['text-warning', 'bg-warning/10', 'border-warning/30'], secondary: ['text-secondary', 'bg-secondary/10', 'border-secondary/30'] }[p.tone];
    const extra = this.extras(key, opts);
    const html = `
      <div class="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
        <span class="relative flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-surface-card ${tone[0]}">
          ${UI.icon(p.icon, 'text-[36px]')}<span class="absolute -right-1 -top-1 h-3 w-3 rounded-full ${tone[1].replace('/10', '')}"></span>
        </span>
        <span class="chip mt-6 border ${tone[2]} ${tone[1]} ${tone[0]} uppercase tracking-wider">${UI.icon('circle', 'icon-fill text-[8px]')} ${p.tag}</span>
        <h1 class="mt-4 text-headline-xl text-balance">${opts.title || p.title}</h1>
        <p class="mt-3 max-w-lg text-body-lg text-ink-secondary">${opts.text || p.text}</p>
        ${extra.body || ''}
        <div class="mt-8 flex flex-wrap justify-center gap-3">${extra.actions || `<a href="/" data-link class="btn-primary px-5">${UI.icon('arrow_back', 'text-[18px]')} Volver al feed</a><button class="btn-secondary px-5" ${UI.on('click', 'UI.back')}>Página anterior</button>`}</div>
        ${extra.footer || ''}
      </div>`;
    if (opts.replaceMain === false) {
      UI.modal({ title: p.title, body: `<p>${opts.text || p.text}</p>${extra.body || ''}`, icon: p.icon, tone: p.tone, actions: `<button class="btn-primary" ${UI.on('click', 'UI.closeModal')}>Entendido</button>` });
      return;
    }
    const main = document.getElementById('main-view-container');
    main.innerHTML = html;
    if (key === '502') this.runDiagnostics();
    if (key === '429' || key === 'lockout' || key === 'post-limit') this.countdown(opts.seconds || (key === 'lockout' ? 300 : 60));
  },

  extras(key, opts) {
    const user = window.api.user;
    const roleName = r => ({ GLOBAL_ADMIN: 'Administrador global', COMMUNITY_MOD: 'Moderador de comunidad', USER: 'Usuario' }[r] || 'Visitante');
    switch (key) {
      case '403': return {
        body: `
          <div class="card mt-8 grid w-full gap-4 text-left sm:grid-cols-2">
            <div><div class="text-label-sm uppercase tracking-wider text-ink-muted">Nivel requerido</div><div class="mt-1 text-headline-sm">${opts.required || 'Moderador o administrador'}</div></div>
            <div class="sm:text-right"><div class="text-label-sm uppercase tracking-wider text-ink-muted">Tu rol actual</div><div class="mt-1 text-headline-sm text-ink-secondary">${roleName(user && user.global_role)}</div></div>
          </div>`,
        actions: `<a href="/" data-link class="btn-primary px-5">${UI.icon('arrow_back', 'text-[18px]')} Volver a una sección permitida</a>${user ? `<button class="btn-secondary px-5" ${UI.on('click', 'Router.logout')}>${UI.icon('swap_horiz', 'text-[18px]')} Cambiar de cuenta</button>` : ''}`,
        footer: '<p class="mt-8 text-body-sm text-ink-muted">Si crees que es un error, contacta a un administrador del sistema.</p>'
      };
      case 'route': case '404': return {
        body: opts.path ? `<code class="mt-6 rounded border border-line bg-surface-card px-3 py-1.5 font-mono text-body-sm text-ink-secondary">${UI.esc(opts.path)}</code>` : '',
        actions: `<a href="/" data-link class="btn-primary px-5">${UI.icon('home', 'text-[18px]')} Ir al feed</a><a href="/search" data-link class="btn-secondary px-5">${UI.icon('search', 'text-[18px]')} Buscar</a><a href="/communities" data-link class="btn-secondary px-5">${UI.icon('explore', 'text-[18px]')} Explorar comunidades</a>`
      };
      case 'community-404': return {
        body: opts.name ? `<code class="mt-6 rounded border border-line bg-surface-card px-3 py-1.5 font-mono text-body-sm text-secondary">c/${UI.esc(opts.name)}</code>` : '',
        actions: `<a href="/communities" data-link class="btn-primary px-5">${UI.icon('explore', 'text-[18px]')} Explorar comunidades</a>${user ? `<a href="/c/create" data-link class="btn-secondary px-5">${UI.icon('add', 'text-[18px]')} Fundar c/${UI.esc(opts.name || 'nueva')}</a>` : ''}`
      };
      case '502': return {
        body: `<div class="card mt-8 w-full text-left"><div class="mb-3 flex items-center justify-between"><span class="text-headline-sm">Diagnóstico</span><span class="chip-neutral font-mono" id="diag-time"></span></div><ul id="diag-list" class="flex flex-col gap-2 text-body-sm"></ul></div>`,
        actions: `<button class="btn-primary px-5" ${UI.on('click', 'Router.handleRoute')}>${UI.icon('refresh', 'text-[18px]')} Reintentar ahora</button><a href="/status" data-link class="btn-secondary px-5">Estado del servicio</a>`
      };
      case 'offline': return { actions: `<button class="btn-primary px-5" ${UI.on('click', 'Router.handleRoute')}>${UI.icon('refresh', 'text-[18px]')} Reintentar</button>` };
      case '500': case 'maintenance': return {
        body: opts.detail ? `<code class="mt-6 max-w-full truncate rounded border border-line bg-surface-card px-3 py-1.5 font-mono text-body-sm text-ink-muted">${UI.esc(opts.detail)}</code>` : '',
        actions: `<button class="btn-primary px-5" ${UI.on('click', opts.retry ? 'StatusView.runRetry' : 'Router.handleRoute')}>${UI.icon('refresh', 'text-[18px]')} Reintentar</button><a href="/status" data-link class="btn-secondary px-5">Estado del servicio</a>`
      };
      case '409': return {
        body: opts.detail ? `<div class="card mt-6 w-full text-left text-body-md"><span class="text-warning">${UI.icon('info', 'align-middle text-[18px]')}</span> ${UI.esc(opts.detail)}</div>` : '',
        actions: `<button class="btn-primary px-5" ${UI.on('click', 'Router.handleRoute')}>${UI.icon('refresh', 'text-[18px]')} Recargar los datos actuales</button><button class="btn-secondary px-5" ${UI.on('click', 'UI.back')}>Volver</button>`
      };
      case '429': case 'lockout': case 'post-limit': return {
        body: `<div class="card mt-8 flex w-full items-center justify-between text-left"><span class="text-body-md text-ink-secondary">Podrás continuar en</span><span id="status-countdown" class="font-mono text-headline-lg text-warning">--:--</span></div>`,
        actions: `<a href="/" data-link class="btn-secondary px-5">Volver al feed</a>`
      };
      case 'suspended': return {
        body: `<div class="card mt-8 w-full text-left"><div class="text-label-sm uppercase tracking-wider text-ink-muted">Motivo registrado</div><p class="mt-1 text-body-md">${UI.esc(opts.reason || 'Sin motivo especificado por el administrador.')}</p><p class="mt-3 text-body-sm text-ink-muted">Si crees que es un error, escribe a un administrador desde otra cuenta o por los canales oficiales.</p></div>`,
        actions: `<a href="/" data-link class="btn-secondary px-5">Explorar como visitante</a>`
      };
      case 'community-restricted': return {
        actions: `${opts.community ? `<button class="btn-primary px-5" ${UI.on('click', 'CommunityView.toggleJoin', opts.community.id, opts.community.name, false)}>${UI.icon('group_add', 'text-[18px]')} Unirme a c/${UI.esc(opts.community.name)}</button>` : ''}<a href="/communities" data-link class="btn-secondary px-5">Explorar otras comunidades</a>`
      };
      case 'session-invalid': return { actions: `<a href="/login" data-link class="btn-primary px-5">Iniciar sesión</a>` };
      default: return {};
    }
  },

  countdown(seconds) {
    clearInterval(this._cd);
    const end = Date.now() + seconds * 1000;
    const tick = () => {
      const el = document.getElementById('status-countdown');
      if (!el) return clearInterval(this._cd);
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      if (!left) { clearInterval(this._cd); el.textContent = 'Listo'; el.classList.replace('text-warning', 'text-primary'); }
    };
    tick();
    this._cd = setInterval(tick, 1000);
  },

  // 06_56 Diagnóstico real: conectividad del navegador, servidor y base de datos
  async runDiagnostics() {
    const list = document.getElementById('diag-list');
    if (!list) return;
    const row = (ok, label, detail) => `<li class="flex items-center justify-between gap-3 rounded bg-surface-base px-3 py-2"><span class="flex items-center gap-2">${UI.icon(ok === null ? 'pending' : ok ? 'check_circle' : 'cancel', `text-[18px] ${ok === null ? 'text-ink-muted' : ok ? 'text-primary' : 'text-danger'}`)}${label}</span><span class="font-mono text-ink-muted">${detail}</span></li>`;
    const rows = [row(navigator.onLine, 'Conexión del dispositivo', navigator.onLine ? 'en línea' : 'sin red')];
    list.innerHTML = rows.join('') + row(null, 'Servidor de la API', 'comprobando…');
    const t0 = performance.now();
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      const data = await res.json().catch(() => ({}));
      rows.push(row(true, 'Servidor de la API', `${res.status} · ${ms} ms`));
      rows.push(row(data.database === 'CONNECTED', 'Base de datos (Cloud SQL)', data.database || 'desconocido'));
    } catch (_) {
      rows.push(row(false, 'Servidor de la API', 'sin respuesta'));
    }
    list.innerHTML = rows.join('');
    const t = document.getElementById('diag-time');
    if (t) t.textContent = new Date().toLocaleTimeString('es');
  },

  // 06_58 Estado del servicio e infraestructura
  async service() {
    const main = document.getElementById('main-view-container');
    main.innerHTML = UI.pageHeader('Estado del servicio', 'Comprobaciones en vivo de la API, la base de datos y los servicios principales.', `<button class="btn-secondary" ${UI.on('click', 'StatusView.service')}>${UI.icon('refresh', 'text-[18px]')} Actualizar</button>`, 'monitor_heart') + UI.skeletonPosts(2);
    const checks = [
      ['API y servidor web', '/health', 'dns'],
      ['Feed de publicaciones', '/api/v1/posts?limit=1', 'dynamic_feed'],
      ['Comunidades', '/api/v1/communities?limit=1', 'groups'],
      ['Búsqueda', '/api/v1/search/predictive?q=go', 'search']
    ];
    const results = await Promise.all(checks.map(async ([name, url, icon]) => {
      const t0 = performance.now();
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = url === '/health' ? await res.json().catch(() => ({})) : null;
        return { name, icon, ok: res.ok, ms: Math.round(performance.now() - t0), status: res.status, body };
      } catch (_) {
        return { name, icon, ok: false, ms: null, status: 'sin respuesta' };
      }
    }));
    const health = results[0].body || {};
    const dbOk = health.database === 'CONNECTED';
    const all = results.every(r => r.ok) && dbOk;
    main.innerHTML = UI.pageHeader('Estado del servicio', 'Comprobaciones en vivo de la API, la base de datos y los servicios principales.', `<button class="btn-secondary" ${UI.on('click', 'StatusView.service')}>${UI.icon('refresh', 'text-[18px]')} Actualizar</button>`, 'monitor_heart') + `
      <div class="card mb-4 flex items-center gap-4 ${all ? 'border-primary/30' : 'border-warning/40'}">
        <span class="flex h-12 w-12 items-center justify-center rounded-full ${all ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}">${UI.icon(all ? 'check_circle' : 'warning', 'text-[28px]')}</span>
        <div><div class="text-headline-md">${all ? 'Todos los sistemas operativos' : 'Servicio degradado'}</div>
        <div class="text-body-sm text-ink-secondary">Entorno: <span class="font-mono">${UI.esc(health.environment || '—')}</span> · Revisado ${new Date().toLocaleTimeString('es')}</div></div>
      </div>
      <div class="card divide-y divide-line p-0">
        ${results.map(r => `
          <div class="flex items-center gap-3 px-4 py-3">
            <span class="text-ink-secondary">${UI.icon(r.icon)}</span>
            <span class="flex-1 text-label-lg">${r.name}</span>
            <span class="font-mono text-body-sm text-ink-muted">${r.ms != null ? r.ms + ' ms' : ''}</span>
            <span class="${r.ok ? 'chip-primary' : 'chip-danger'}">${r.ok ? 'Operativo' : `Falla (${r.status})`}</span>
          </div>`).join('')}
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="text-ink-secondary">${UI.icon('database')}</span>
          <span class="flex-1 text-label-lg">Base de datos (Cloud SQL PostgreSQL)</span>
          <span class="${dbOk ? 'chip-primary' : 'chip-danger'}">${dbOk ? 'Conectada' : 'Desconectada'}</span>
        </div>
      </div>
      <div class="card mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><div class="text-label-lg">Modo ligero</div><div class="text-body-sm text-ink-secondary">No carga imágenes; útil con conexiones lentas o datos limitados.</div></div>
        <button class="switch ${this.isLite() ? 'on' : ''}" ${UI.on('click', 'StatusView.toggleLite', UI.EL)} aria-label="Modo ligero"></button>
      </div>`;
  },

  // 06_72 Modal requerir autenticación
  requireAuth(path) {
    document.getElementById('main-view-container').innerHTML = UI.empty({
      icon: 'lock', title: 'Necesitas iniciar sesión', text: 'Esta sección es solo para miembros de Forfunable.',
      action: `<a href="/login" data-link class="btn-primary">Iniciar sesión</a><a href="/register" data-link class="btn-secondary">Crear cuenta</a>`
    });
    this.authModal('Para continuar necesitas una cuenta. Es gratis y toma un minuto.', path);
  },

  authModal(text = 'Inicia sesión para votar, comentar y participar en las comunidades.', path) {
    if (path) { try { sessionStorage.setItem('forfunable_after_login', path); } catch (_) {} }
    UI.modal({
      title: 'Inicia sesión para continuar', icon: 'lock_person', tone: 'primary', body: `<p>${text}</p>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Ahora no</button><a href="/register" data-link class="btn-secondary" ${UI.on('click', 'UI.closeModal')}>Crear cuenta</a><a href="/login" data-link class="btn-primary" ${UI.on('click', 'UI.closeModal')}>Iniciar sesión</a>`
    });
  },

  // 06_70 Sesión expirada y reautenticación segura (sin perder la página actual)
  sessionExpired() {
    if (document.getElementById('reauth-email')) return;
    const last = this._lastUser;
    UI.modal({
      title: 'Tu sesión expiró', icon: 'schedule', tone: 'warning', dismissable: false,
      body: `<p>Por seguridad cerramos tu sesión tras un tiempo. Vuelve a ingresar para seguir donde estabas.</p>
        <div class="mt-4 text-left">
          ${UI.field('reauth-email', 'Correo electrónico', { type: 'email', value: '', placeholder: 'nombre@correo.com' })}
          ${UI.field('reauth-password', 'Contraseña', { type: 'password' })}
        </div>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'StatusView.leave')}>Salir</button><button class="btn-primary" ${UI.on('click', 'StatusView.reauth')}>Volver a ingresar</button>`
    });
    if (last) document.getElementById('reauth-email').placeholder = `Correo de @${last}`;
  },

  async reauth() {
    const email = document.getElementById('reauth-email').value.trim();
    const pass = document.getElementById('reauth-password').value;
    if (!UI.setHint('reauth-email', AuthView.validators.email(email)) || !UI.setHint('reauth-password', pass ? '' : 'Escribe tu contraseña.')) return;
    try {
      await window.api.login(email, pass);
      document.getElementById('ui-modal')?.remove();
      window.utils.showToast('Sesión restablecida', 'info');
      Router.handleRoute();
    } catch (err) {
      UI.setHint('reauth-password', err.message || 'Credenciales incorrectas');
    }
  },

  // 06_67 Votando muy rápido / 06_64 límite general
  rateLimited(err) {
    const now = Date.now();
    if (this._lastRate && now - this._lastRate < 3000) return;
    this._lastRate = now;
    UI.modal({
      title: 'Vas muy rápido', icon: 'speed', tone: 'warning',
      body: `<p>${UI.esc(err.message || 'Superaste el límite de solicitudes.')} Espera un minuto antes de seguir votando o publicando.</p>`,
      actions: `<button class="btn-primary" ${UI.on('click', 'UI.closeModal')}>Entendido</button>`
    });
  },

  // Errores de acceso al iniciar sesión o registrarse
  handleAuthError(err, ctx) {
    if (err.error === 'ACCOUNT_SUSPENDED') {
      Router.setLayout('wide');
      this.page('suspended', { reason: (err.message || '').replace(/^La cuenta está suspendida:\s*/, '') });
      return true;
    }
    if (err.error === 'RECAPTCHA_FAILED') { this.page('antibot', { replaceMain: false }); return true; }
    if (err.status === 429) { this.page('lockout', { replaceMain: false }); return true; }
    if (err.status === 0) { this.page('502', { replaceMain: false }); return true; }
    return false;
  },

  // Aviso para errores de acciones (no de carga de página)
  toastError(err, fallback = 'No se pudo completar la acción') {
    if (!err) return window.utils.showToast(fallback, 'error');
    if (err.status === 401) return this.authModal();
    if (err.status === 429) return this.rateLimited(err);
    if (err.error === 'RECAPTCHA_FAILED') return this.page('antibot', { replaceMain: false });
    if (err.error === 'BANNED') return this.page('403', { replaceMain: false, title: 'Estás sancionado en esta comunidad', text: err.message });
    if (err.status === 0) return window.utils.showToast('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.', 'error');
    if (err.status === 409) return window.utils.showToast(err.message || 'Conflicto: los datos cambiaron', 'warning');
    window.utils.showToast(err.message || fallback, 'error');
  },

  // Error al cargar una página completa
  fromError(err, retry) {
    this._retry = retry || (() => Router.handleRoute());
    if (!err) return this.page('500');
    if (err.status === 0) return this.page(navigator.onLine ? '502' : 'offline');
    if (err.status === 401) return this.page('session-invalid');
    if (err.status === 403) return this.page('403', { text: err.message });
    if (err.status === 404) return this.page('404', { what: 'resource' });
    if (err.status === 409) return this.page('409', { detail: err.message });
    if (err.status === 429) return this.page('429');
    if (err.status === 503) return this.page('maintenance', { detail: err.message });
    return this.page('500', { detail: err.message || String(err), retry: true });
  }
};
