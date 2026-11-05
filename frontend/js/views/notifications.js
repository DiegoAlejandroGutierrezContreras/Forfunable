/**
 * 03_19 Centro de notificaciones y alertas de reputación, 03_20 Notificaciones agrupadas y filtrado avanzado.
 * Conectada a /api/v1/notifications, /:id/read y /read-all.
 * El tipo indica a dónde lleva cada aviso: post:<id>, c:<nombre>, chat, account.
 */

window.NotificationsView = {
  filter: 'all',
  notifs: [],

  categories: [
    { id: 'all', label: 'Todas', icon: 'inbox' },
    { id: 'unread', label: 'No leídas', icon: 'mark_email_unread' },
    { id: 'post', label: 'Comentarios', icon: 'forum' },
    { id: 'chat', label: 'Mensajes', icon: 'chat' },
    { id: 'community', label: 'Comunidades', icon: 'groups' },
    { id: 'account', label: 'Moderación', icon: 'shield' }
  ],

  kind(n) {
    const t = n.type || '';
    if (t.startsWith('post:')) return 'post';
    if (t.startsWith('c:')) return 'community';
    if (t === 'chat') return 'chat';
    return 'account';
  },

  linkFor(type = '') {
    if (type.startsWith('post:')) return `/posts/${type.slice(5)}`;
    if (type.startsWith('c:')) return `/c/${type.slice(2)}`;
    if (type === 'chat') return '/chat';
    if (type === 'account') return '/profile';
    return null;
  },

  style(n) {
    return {
      post: ['forum', 'bg-secondary/10 text-secondary'],
      chat: ['chat', 'bg-primary/10 text-primary'],
      community: ['group_add', 'bg-tertiary/15 text-tertiary-soft'],
      account: [/retirad/i.test(n.title) ? 'gpp_bad' : 'shield', /retirad/i.test(n.title) ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning']
    }[this.kind(n)];
  },

  async render(query = {}) {
    this.filter = query.filter || 'all';
    $main().innerHTML = `
      ${UI.pageHeader('Notificaciones', 'Respuestas, mensajes, comunidades y avisos de moderación.', `
        <a href="/settings/notifications" data-link class="btn-secondary">${UI.icon('tune', 'text-[18px]')} Preferencias</a>
        <button class="btn-primary" ${UI.on('click', 'NotificationsView.markAllAsRead')}>${UI.icon('done_all', 'text-[18px]')} Marcar todo como leído</button>`, 'notifications')}
      <div id="notif-filters" class="mb-4"></div>
      <div id="notifications-list">${UI.skeletonPosts(3)}</div>`;
    await this.load();
  },

  async load() {
    try {
      this.notifs = await window.api.listNotifications();
      this.paint();
      this.paintRail();
    } catch (err) {
      document.getElementById('notifications-list').innerHTML = UI.error(err, () => NotificationsView.load());
    }
  },

  setFilter(f) {
    this.filter = f;
    window.history.replaceState(null, '', f === 'all' ? '/notifications' : `/notifications?filter=${f}`);
    this.paint();
  },

  // Agrupa avisos del mismo tipo y destino sin leer (p. ej. "3 comentarios nuevos en «X»")
  group(list) {
    const groups = [];
    list.forEach(n => {
      const last = groups[groups.length - 1];
      if (last && last.type === n.type && last.is_read === n.is_read && n.type !== 'account' && n.title === last.title) {
        last.items.push(n);
      } else {
        groups.push({ type: n.type, is_read: n.is_read, title: n.title, items: [n] });
      }
    });
    return groups;
  },

  bucket(date) {
    const d = new Date(date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = (today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000;
    if (diff <= 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return 'Esta semana';
    return 'Anteriores';
  },

  paint() {
    const counts = {};
    this.categories.forEach(c => { counts[c.id] = 0; });
    this.notifs.forEach(n => { counts.all++; if (!n.is_read) counts.unread++; counts[this.kind(n)]++; });
    document.getElementById('notif-filters').innerHTML = UI.tabs(this.categories.map(c => ({ ...c, count: counts[c.id] || null })), this.filter, 'NotificationsView.setFilter');

    const list = this.notifs.filter(n => this.filter === 'all' || (this.filter === 'unread' ? !n.is_read : this.kind(n) === this.filter));
    const box = document.getElementById('notifications-list');
    if (!list.length) {
      box.innerHTML = UI.empty({
        icon: 'notifications_off', title: this.filter === 'unread' ? 'Estás al día' : 'Sin notificaciones',
        text: 'Aquí verás comentarios y respuestas a tus publicaciones, solicitudes de chat, mensajes, nuevos miembros en tus comunidades y avisos de moderación.'
      });
      return;
    }
    const buckets = {};
    list.forEach(n => { const b = this.bucket(n.created_at); (buckets[b] = buckets[b] || []).push(n); });
    box.innerHTML = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'].filter(b => buckets[b]).map(b => `
      <section class="mb-5">
        <h3 class="mb-2 text-label-sm uppercase tracking-wider text-ink-muted">${b}</h3>
        <div class="card divide-y divide-line p-0">
          ${this.group(buckets[b]).map(g => this.row(g)).join('')}
        </div>
      </section>`).join('');
  },

  row(g) {
    const n = g.items[0];
    const [icon, cls] = this.style(n);
    const many = g.items.length > 1;
    return `
      <div class="group flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-elevated ${n.is_read ? 'opacity-70' : ''}" ${UI.on('click', 'NotificationsView.open', g.items.map(x => x.id).join(','))}>
        <span class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cls}">${UI.icon(icon, 'text-[20px]')}${many ? `<span class="absolute -right-1 -top-1 rounded-full bg-surface-elevated px-1.5 font-mono text-[10px] text-ink ring-1 ring-line">${g.items.length}</span>` : ''}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-label-md text-ink-secondary">${UI.esc(n.title)}${!n.is_read ? '<span class="h-2 w-2 rounded-full bg-primary"></span>' : ''}</div>
          <div class="mt-0.5 text-body-md text-ink">${many ? `${g.items.length} avisos · ${UI.esc(n.message)}` : UI.esc(n.message)}</div>
          <div class="mt-1 text-body-sm text-ink-muted">${window.utils.formatTime(n.created_at)}</div>
        </div>
        ${!n.is_read ? `<button class="btn-ghost btn-sm opacity-0 group-hover:opacity-100" ${UI.on('click.stop', 'NotificationsView.markAsRead', g.items.map(x => x.id).join(','))} title="Marcar como leída">${UI.icon('done', 'text-[17px]')}</button>` : ''}
      </div>`;
  },

  // 03_19 Alertas de reputación en la columna derecha
  paintRail() {
    const me = window.api.user;
    const unread = this.notifs.filter(n => !n.is_read).length;
    const r = UI.rank(me.karma_score || 0);
    Router.setRail(`
      <div class="card">
        <h3 class="text-headline-sm">Resumen</h3>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <div class="rounded bg-surface-base p-3"><div class="font-display text-headline-lg">${unread}</div><div class="text-body-sm text-ink-muted">Sin leer</div></div>
          <div class="rounded bg-surface-base p-3"><div class="font-display text-headline-lg">${this.notifs.length}</div><div class="text-body-sm text-ink-muted">En total</div></div>
        </div>
      </div>
      <div class="card">
        <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('trending_up', 'text-primary')} Alerta de reputación</h3>
        <p class="mt-2 text-body-sm text-ink-secondary">${r.next ? `Te faltan <strong class="text-ink">${(r.next.min - (me.karma_score || 0)).toLocaleString('es')}</strong> puntos para alcanzar <strong class="text-secondary">${r.next.name}</strong>.` : 'Alcanzaste el rango máximo.'}</p>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-base"><div class="h-full rounded-full bg-primary" style="width:${r.progress}%"></div></div>
      </div>`);
  },

  async markAsRead(ids) {
    try {
      await Promise.all(String(ids).split(',').map(id => window.api.markNotificationRead(id)));
      await this.load();
      Router.refreshBadges();
    } catch (err) {
      StatusView.toastError(err);
    }
  },

  async markAllAsRead() {
    try {
      await window.api.markAllNotificationsRead();
      await this.load();
      Router.refreshBadges();
      window.utils.showToast('Todo marcado como leído', 'info');
    } catch (err) {
      StatusView.toastError(err, 'No se pudieron marcar');
    }
  },

  // Abrir un aviso lo marca como leído y lleva a su contenido; los de moderación abren el aviso oficial (06_92)
  async open(ids) {
    const list = String(ids).split(',');
    const n = this.notifs.find(x => x.id === list[0]);
    if (!n) return;
    if (this.kind(n) === 'account') return Router.navigate(`/notice/${n.id}`);
    const unread = list.filter(id => !(this.notifs.find(x => x.id === id) || {}).is_read);
    if (unread.length) { try { await Promise.all(unread.map(id => window.api.markNotificationRead(id))); } catch (_) {} Router.refreshBadges(); }
    const link = this.linkFor(n.type);
    if (link) Router.navigate(link); else this.load();
  }
};
