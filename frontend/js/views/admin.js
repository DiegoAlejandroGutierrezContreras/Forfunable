/**
 * Consola de administración:
 * 05_34 Métricas y telemetría, 05_35 Cola de reportes, 05_36 Registro de auditoría de moderación,
 * 05_44 Auditoría administrativa, 05_42 Roles y permisos globales, 05_43 Suspender y reactivar cuenta,
 * 05_45 Detección de cuentas sospechosas (Sybil), 05_46 Reindexación del ranking.
 * Conectada a /api/v1/admin/*.
 */

window.AdminView = {
  tabs: [
    { id: 'metrics', label: 'Métricas', icon: 'monitoring' },
    { id: 'reports', label: 'Cola de reportes', icon: 'flag' },
    { id: 'appeals', label: 'Apelaciones', icon: 'gavel' },
    { id: 'audit', label: 'Auditoría', icon: 'receipt_long' },
    { id: 'users', label: 'Usuarios y roles', icon: 'manage_accounts', admin: true },
    { id: 'sybil', label: 'Cuentas sospechosas', icon: 'policy', admin: true },
    { id: 'ranking', label: 'Ranking', icon: 'model_training' }
  ],

  isAdmin() { return window.api.user && window.api.user.global_role === 'GLOBAL_ADMIN'; },

  async render(tab) {
    const def = this.tabs.find(t => t.id === tab);
    if (!def) return StatusView.page('404', { path: window.location.pathname });
    if (def.admin && !this.isAdmin()) return StatusView.page('403', { required: 'Administrador global' });
    this.tab = tab;
    $main().innerHTML = `
      ${UI.pageHeader('Consola de administración', 'Gobernanza, moderación y salud de la plataforma. Todas las acciones quedan auditadas.', `<span class="${this.isAdmin() ? 'chip-danger' : 'chip-tertiary'} py-1">${this.isAdmin() ? 'GLOBAL_ADMIN' : 'COMMUNITY_MOD'}</span>`, 'admin_panel_settings')}
      <div class="mb-4 flex flex-wrap gap-1 rounded-lg border border-line bg-surface-card p-1.5">
        ${this.tabs.filter(t => !t.admin || this.isAdmin()).map(t => `<a href="/admin/${t.id}" data-link class="tab ${t.id === tab ? 'active' : ''}">${UI.icon(t.icon, 'text-[17px]')}${t.label}</a>`).join('')}
      </div>
      <div id="admin-content">${UI.skeletonPosts(2)}</div>`;
    try {
      await this[tab]();
    } catch (err) {
      document.getElementById('admin-content').innerHTML = UI.error(err, () => AdminView.render(tab));
    }
  },

  box() { return document.getElementById('admin-content'); },

  stat(label, value, icon, cls = 'text-primary', sub = '') {
    return `
      <div class="card">
        <div class="flex items-center justify-between text-label-sm uppercase tracking-wider text-ink-muted">${label}${UI.icon(icon, `text-[20px] ${cls}`)}</div>
        <div class="mt-2 font-display text-headline-xl">${value}</div>
        ${sub ? `<div class="text-body-sm text-ink-muted">${sub}</div>` : ''}
      </div>`;
  },

  // 05_34 Métricas y telemetría del sistema (datos reales de la base y del endpoint /health)
  async metrics() {
    const t0 = performance.now();
    const [m, health, comms, posts, pending] = await Promise.all([
      window.api.adminMetrics('24h'),
      fetch('/health', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      window.api.listCommunities().catch(() => []),
      window.api.listPosts({ sort: 'newest', limit: 100 }).catch(() => []),
      window.api.adminListAllReports('PENDING').catch(() => [])
    ]);
    const latency = Math.round(performance.now() - t0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
    const perDay = days.map(d => posts.filter(p => { const c = new Date(p.created_at); return c >= d && c < new Date(d.getTime() + 86400000); }).length);
    const maxDay = Math.max(1, ...perDay);
    const top = [...comms].sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0)).slice(0, 6);
    const maxMembers = Math.max(1, ...top.map(c => c.subscribers_count || 0));
    const dbOk = health.database === 'CONNECTED';
    this.box().innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        ${this.stat('Usuarios activos', (m.active_users || 0).toLocaleString('es'), 'group')}
        ${this.stat('Publicaciones', (m.total_posts || 0).toLocaleString('es'), 'article', 'text-secondary')}
        ${this.stat('Comentarios', (m.total_comments || 0).toLocaleString('es'), 'forum', 'text-tertiary-soft')}
        ${this.stat('Comunidades', (m.communities || 0).toLocaleString('es'), 'hub', 'text-warning')}
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div class="card">
          <div class="flex items-center justify-between"><h3 class="text-headline-sm">Publicaciones por día</h3><span class="chip-neutral">Últimos 7 días</span></div>
          <div class="mt-5 flex h-40 items-end gap-2">
            ${perDay.map((n, i) => `
              <div class="flex flex-1 flex-col items-center gap-1.5">
                <span class="font-mono text-body-sm text-ink-secondary">${n}</span>
                <div class="w-full rounded-t bg-primary/80" style="height:${Math.max(4, n / maxDay * 120)}px"></div>
                <span class="text-label-sm text-ink-muted">${days[i].toLocaleDateString('es', { weekday: 'short' })}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <h3 class="text-headline-sm">Salud del sistema</h3>
          <ul class="mt-3 flex flex-col gap-2 text-body-sm">
            <li class="flex items-center justify-between rounded bg-surface-base px-3 py-2"><span class="flex items-center gap-2">${UI.icon('database', 'text-[18px] text-ink-secondary')}Cloud SQL</span><span class="${dbOk ? 'chip-primary' : 'chip-danger'}">${dbOk ? 'Conectada' : 'Caída'}</span></li>
            <li class="flex items-center justify-between rounded bg-surface-base px-3 py-2"><span class="flex items-center gap-2">${UI.icon('speed', 'text-[18px] text-ink-secondary')}Latencia de la consola</span><span class="font-mono">${latency} ms</span></li>
            <li class="flex items-center justify-between rounded bg-surface-base px-3 py-2"><span class="flex items-center gap-2">${UI.icon('flag', 'text-[18px] text-ink-secondary')}Reportes pendientes</span><a href="/admin/reports" data-link class="${pending.length ? 'chip-warning' : 'chip-primary'}">${pending.length}</a></li>
            <li class="flex items-center justify-between rounded bg-surface-base px-3 py-2"><span class="flex items-center gap-2">${UI.icon('cloud', 'text-[18px] text-ink-secondary')}Entorno</span><span class="font-mono">${UI.esc(health.environment || '—')}</span></li>
          </ul>
        </div>
      </div>
      <div class="card mt-4">
        <h3 class="text-headline-sm">Comunidades con más miembros</h3>
        <div class="mt-4 flex flex-col gap-3">
          ${top.length ? top.map(c => `
            <a href="/c/${encodeURIComponent(c.name)}" data-link class="grid grid-cols-[160px_1fr_48px] items-center gap-3 text-body-sm hover:text-secondary">
              <span class="truncate">c/${UI.esc(c.name)}</span>
              <span class="h-2 overflow-hidden rounded-full bg-surface-base"><span class="block h-full rounded-full bg-secondary" style="width:${(c.subscribers_count || 0) / maxMembers * 100}%"></span></span>
              <span class="text-right font-mono text-ink-secondary">${c.subscribers_count || 0}</span>
            </a>`).join('') : '<p class="text-body-sm text-ink-muted">Sin comunidades.</p>'}
        </div>
      </div>`;
  },

  // 05_35 Administración y cola de reportes
  async reports() {
    const reports = await window.api.adminListReports();
    this.reportList = reports;
    const label = { POST: 'Publicación', COMMENT: 'Comentario', USER: 'Usuario', CHAT_MESSAGE: 'Mensaje' };
    this.box().innerHTML = `
      <div class="mb-3 flex items-center justify-between"><h2 class="text-headline-md">Pendientes de revisión <span class="chip-warning ml-1">${reports.length}</span></h2>
        <a href="/admin/audit?filter=moderation" data-link class="btn-ghost btn-sm">${UI.icon('history', 'text-[17px]')} Ver resueltos</a></div>
      ${reports.length ? `<div class="flex flex-col gap-3">${reports.map(r => `
        <div class="card flex flex-wrap items-start gap-4 ${r.reason_code === 'VULNERABILIDAD' ? 'border-danger/40' : ''}">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${r.reason_code === 'VULNERABILIDAD' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}">${UI.icon(r.reason_code === 'VULNERABILIDAD' ? 'bug_report' : 'flag')}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2"><span class="chip-tertiary">${label[r.target_type] || r.target_type}</span><span class="text-label-lg text-danger">${UI.esc(r.reason_code)}</span>${r.reason_code === 'VULNERABILIDAD' ? '<span class="chip-danger">Prioridad alta</span>' : ''}</div>
            ${r.target_preview ? `<p class="mt-2 truncate text-body-md text-ink">«${UI.esc(r.target_preview)}»</p>` : '<p class="mt-2 text-body-sm text-ink-muted">El contenido ya no existe.</p>'}
            ${r.description ? `<p class="mt-1 text-body-sm text-ink-secondary">${UI.esc(r.description)}</p>` : ''}
            <p class="mt-1 text-body-sm text-ink-muted">Denunciado por @${UI.esc(r.reporter_username || 'usuario')} · ${window.utils.formatTime(r.created_at)}${r.target_post_id ? ` · <a href="/posts/${encodeURIComponent(r.target_post_id)}" data-link class="text-secondary hover:underline">Ver contenido</a>` : ''}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary btn-sm" ${UI.on('click', 'AdminView.resolve', r.id, 'DISMISS')}>Descartar</button>
            <button class="btn-danger btn-sm" ${UI.on('click', 'AdminView.resolve', r.id, 'RESOLVE_DELETE')}>${UI.icon('gavel', 'text-[16px]')} Sancionar / Borrar</button>
          </div>
        </div>`).join('')}</div>` : UI.empty({ icon: 'task_alt', title: 'No hay reportes pendientes', text: 'La comunidad está tranquila. Las denuncias nuevas aparecerán aquí.' })}`;
  },

  async resolve(id, action) {
    const r = this.reportList.find(x => x.id === id);
    const del = action === 'RESOLVE_DELETE';
    const ok = await UI.confirm({
      title: del ? 'Aceptar la denuncia y retirar el contenido' : 'Descartar la denuncia',
      text: del ? 'El contenido se retirará y su autor recibirá una advertencia. Quien denunció será notificado.' : 'El contenido se mantiene. Quien denunció será notificado de que se revisó.',
      confirmText: del ? 'Retirar contenido' : 'Descartar', danger: del, icon: del ? 'gavel' : 'do_not_disturb_on'
    });
    if (!ok) return;
    try {
      await window.api.adminResolveReport(id, action);
      window.utils.showToast(del ? 'Contenido retirado' : 'Denuncia descartada', 'info');
      this.reports();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo resolver');
    }
    return r;
  },

  // 05_36 Registro de moderación y 05_44 Auditoría administrativa
  auditKinds: {
    moderation: ['REMOVE_CONTENT', 'REMOVE_CONTENT_FORCE', 'RESOLVE_REPORT', 'BAN_USER', 'UNBAN_USER', 'ASSIGN_MODERATOR', 'UPDATE_COMMUNITY_SETTINGS', 'ACCESS_APPROVED', 'ACCESS_REJECTED', 'APPEAL_ACCEPTED', 'APPEAL_REJECTED', 'TRANSFER_OWNERSHIP'],
    admin: ['UPDATE_ROLE', 'SUSPEND_USER', 'ACTIVATE_USER', 'DELETE_USER', 'REINDEX_RANKING']
  },

  actionStyle: {
    REMOVE_CONTENT: ['delete', 'text-danger'], REMOVE_CONTENT_FORCE: ['gavel', 'text-danger'], RESOLVE_REPORT: ['task_alt', 'text-primary'],
    BAN_USER: ['block', 'text-danger'], UNBAN_USER: ['lock_open', 'text-primary'], ASSIGN_MODERATOR: ['shield_person', 'text-tertiary-soft'],
    UPDATE_COMMUNITY_SETTINGS: ['tune', 'text-secondary'], UPDATE_ROLE: ['manage_accounts', 'text-warning'], SUSPEND_USER: ['person_off', 'text-danger'],
    ACTIVATE_USER: ['how_to_reg', 'text-primary'], REINDEX_RANKING: ['model_training', 'text-secondary'],
    ACCESS_APPROVED: ['lock_open', 'text-primary'], ACCESS_REJECTED: ['lock', 'text-danger'],
    APPEAL_ACCEPTED: ['gavel', 'text-primary'], APPEAL_REJECTED: ['gavel', 'text-danger'], TRANSFER_OWNERSHIP: ['swap_horiz', 'text-warning'],
    DELETE_USER: ['person_remove', 'text-danger']
  },

  // 01_11 Cola de apelaciones: aceptar levanta la sanción o restaura la publicación
  async appeals() {
    const q = Object.fromEntries(new URLSearchParams(window.location.search));
    this.appealFilter = q.status || this.appealFilter || 'PENDING';
    let list;
    try { list = await window.api.adminListAppeals(this.appealFilter === 'ALL' ? '' : this.appealFilter); } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') { this.box().innerHTML = UI.empty({ icon: 'construction', title: 'Apelaciones no disponibles', text: 'Falta aplicar la migración V003 en el servidor.' }); return; }
      throw err;
    }
    const kind = { COMMUNITY_BAN: ['block', 'Sanción en comunidad'], CONTENT_REMOVAL: ['delete', 'Retiro de contenido'] };
    const chip = { PENDING: 'chip-warning', ACCEPTED: 'chip-primary', REJECTED: 'chip-danger' };
    const label = { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada' };
    this.box().innerHTML = `
      <div class="mb-3">${UI.tabs([{ id: 'PENDING', label: 'Pendientes', icon: 'hourglass_top' }, { id: 'ACCEPTED', label: 'Aceptadas' }, { id: 'REJECTED', label: 'Rechazadas' }, { id: 'ALL', label: 'Todas' }], this.appealFilter, 'AdminView.setAppealFilter')}</div>
      ${list.length ? `<div class="flex flex-col gap-3">${list.map(a => `
        <article class="card">
          <div class="flex flex-wrap items-center gap-2 text-body-sm">
            <span class="flex items-center gap-1.5 text-label-lg">${UI.icon(kind[a.kind][0], 'text-[18px] text-danger')}${kind[a.kind][1]}</span>
            ${a.community_name ? UI.communityChip(a.community_name) : ''}
            <span class="${chip[a.status]}">${label[a.status]}</span>
            <span class="ml-auto text-ink-muted">${UI.userLink(a.username)} · ${window.utils.formatTime(a.created_at)}</span>
          </div>
          <blockquote class="mt-3 border-l-2 border-line-strong pl-3 text-body-md text-ink-secondary">${UI.esc(a.message)}</blockquote>
          <p class="mt-2 font-mono text-body-sm text-ink-muted">Referencia: ${UI.esc(a.reference_id)}</p>
          ${a.status === 'PENDING' ? `
            <div class="mt-4 border-t border-line pt-4">
              <label class="label" for="res-${UI.esc(a.id)}">Resolución (la verá el usuario)</label>
              <textarea id="res-${UI.esc(a.id)}" class="input" rows="2" placeholder="Explica la decisión con al menos 5 caracteres"></textarea>
              <div class="field-hint" id="res-${UI.esc(a.id)}-hint"></div>
              <div class="mt-3 flex flex-wrap justify-end gap-2">
                <button class="btn-danger-ghost" ${UI.on('click', 'AdminView.decideAppeal', a.id, 'REJECT')}>${UI.icon('close', 'text-[18px]')} Mantener sanción</button>
                <button class="btn-primary" ${UI.on('click', 'AdminView.decideAppeal', a.id, 'ACCEPT')}>${UI.icon('check', 'text-[18px]')} Aceptar y revertir</button>
              </div>
            </div>` : `
            <div class="mt-3 rounded border border-line bg-surface-base p-3 text-body-sm"><span class="text-ink-muted">Resolución ${a.resolved_at ? window.utils.formatTime(a.resolved_at) : ''}:</span> ${UI.esc(a.resolution)}</div>`}
        </article>`).join('')}</div>` : UI.empty({ icon: 'gavel', title: this.appealFilter === 'PENDING' ? 'No hay apelaciones pendientes' : 'Sin apelaciones', text: 'Cuando un usuario apele una sanción o un retiro de contenido aparecerá aquí.' })}`;
  },

  setAppealFilter(f) {
    this.appealFilter = f;
    window.history.replaceState(null, '', `/admin/appeals?status=${f}`);
    this.appeals();
  },

  async decideAppeal(id, decision) {
    const field = `res-${id}`;
    const text = document.getElementById(field).value.trim();
    if (!UI.setHint(field, text.length >= 5 ? '' : 'Escribe una resolución de al menos 5 caracteres.')) return;
    try {
      const res = await window.api.adminDecideAppeal(id, decision, text);
      window.utils.showToast(decision === 'ACCEPT' ? (res.effect || 'Apelación aceptada') : 'Apelación rechazada', 'info');
      this.appeals();
    } catch (err) { StatusView.toastError(err, 'No se pudo resolver la apelación'); }
  },

  async audit() {
    const q = Object.fromEntries(new URLSearchParams(window.location.search));
    this.auditFilter = q.filter || this.auditFilter || 'all';
    this.logs = await window.api.adminGetAuditLogs(200);
    this.box().innerHTML = `
      <div class="mb-3 flex flex-wrap items-center gap-2">
        ${UI.tabs([{ id: 'all', label: 'Todo' }, { id: 'moderation', label: 'Moderación', icon: 'shield' }, { id: 'admin', label: 'Administrativa', icon: 'admin_panel_settings' }], this.auditFilter, 'AdminView.setAuditFilter')}
        <input id="audit-search" class="input w-auto flex-1 py-1.5 text-body-sm" placeholder="Filtrar por actor, acción o detalle…" ${UI.on('input', 'AdminView.paintAudit')}>
        <button class="btn-secondary btn-sm" ${UI.on('click', 'AdminView.exportAudit')}>${UI.icon('download', 'text-[17px]')} CSV</button>
      </div>
      <div id="audit-table"></div>
      <p class="mt-3 flex items-center gap-1.5 text-body-sm text-ink-muted">${UI.icon('lock', 'text-[15px]')} Registro de solo inserción: las entradas no se pueden editar ni borrar desde la aplicación.</p>`;
    this.paintAudit();
  },

  setAuditFilter(f) {
    this.auditFilter = f;
    window.history.replaceState(null, '', f === 'all' ? '/admin/audit' : `/admin/audit?filter=${f}`);
    this.audit();
  },

  filteredLogs() {
    const term = (document.getElementById('audit-search')?.value || '').toLowerCase();
    return this.logs.filter(l => (this.auditFilter === 'all' || (this.auditKinds[this.auditFilter] || []).includes(l.action_type))
      && (!term || `${l.moderator_username} ${l.action_type} ${UI.plain(l.reason)}`.toLowerCase().includes(term)));
  },

  paintAudit() {
    const logs = this.filteredLogs();
    document.getElementById('audit-table').innerHTML = logs.length ? `
      <div class="card overflow-x-auto p-0"><table class="table">
        <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>${logs.map(l => {
          const [icon, cls] = this.actionStyle[l.action_type] || ['bolt', 'text-ink-secondary'];
          return `<tr>
            <td class="whitespace-nowrap font-mono text-ink-muted" title="${new Date(l.created_at).toLocaleString('es')}">${new Date(l.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td><a href="/u/${encodeURIComponent(l.moderator_username || '')}" data-link class="text-secondary hover:underline">@${UI.esc(l.moderator_username || 'sistema')}</a></td>
            <td class="whitespace-nowrap"><span class="flex items-center gap-1.5 font-mono text-[12px] ${cls}">${UI.icon(icon, 'text-[16px]')}${UI.esc(l.action_type)}</span></td>
            <td class="text-ink-secondary">${UI.esc(l.reason)}</td>
          </tr>`;
        }).join('')}</tbody></table></div>` : UI.empty({ icon: 'receipt_long', title: 'Sin registros', text: 'Las acciones de moderación y administración aparecerán aquí.' });
  },

  exportAudit() {
    const rows = [['fecha', 'actor', 'accion', 'objetivo', 'detalle'], ...this.filteredLogs().map(l => [l.created_at, l.moderator_username, l.action_type, l.target_id, UI.plain(l.reason)])];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `auditoria-forfunable-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // 05_42 Gestión de roles y permisos globales, 05_43 Suspender y reactivar cuenta global
  async users() {
    this.box().innerHTML = `
      <div class="mb-3 grid gap-2 sm:grid-cols-3">
        ${[['USER', 'Usuario', 'Publica, comenta y vota'], ['COMMUNITY_MOD', 'Moderador', 'Cola de reportes, sanciones y ajustes de comunidad'], ['GLOBAL_ADMIN', 'Administrador global', 'Todo lo anterior, roles y suspensiones']].map(([k, l, d]) => `<div class="rounded border border-line bg-surface-card p-3"><div class="flex items-center gap-2 text-label-lg">${UI.roleBadge(k) || '<span class="chip-neutral">Usuario</span>'}${l}</div><div class="mt-1 text-body-sm text-ink-muted">${d}</div></div>`).join('')}
      </div>
      <input id="users-search" class="input mb-3" placeholder="Buscar por usuario o correo…" ${UI.on('input', 'AdminView.searchUsers')}>
      <div id="users-table">${UI.skeletonPosts(1)}</div>`;
    await this.loadUsers();
  },

  searchUsers() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.loadUsers(), 250);
  },

  previewThreshold(el) { document.getElementById('thr-val').textContent = Math.round(el.value * 100) + '%'; },
  setThreshold(el) { this.threshold = Number(el.value); this.sybil(); },

  async loadUsers() {
    const search = document.getElementById('users-search').value.trim();
    const data = await window.api.request(`/admin/users?limit=100${search ? '&search=' + encodeURIComponent(search) : ''}`);
    const users = window.api.listFrom(data);
    const me = window.api.user;
    document.getElementById('users-table').innerHTML = users.length ? `
      <div class="card overflow-x-auto p-0"><table class="table">
        <thead><tr><th>Usuario</th><th>Karma</th><th>Rol global</th><th>Estado</th><th></th></tr></thead>
        <tbody>${users.map(u => {
          const deleted = /@eliminado\.invalid$/.test(u.email || '');
          const self = u.id === me.id;
          const canDelete = !self && !deleted && u.global_role !== 'GLOBAL_ADMIN';
          return `
          <tr class="${deleted ? 'opacity-60' : u.is_active ? '' : 'bg-danger/5'}">
            <td>${deleted
              ? `<span class="flex items-center gap-2">${UI.avatar(u, 30)}<span><span class="block text-label-lg text-ink-muted">@${UI.esc(u.username)}</span><span class="block text-body-sm text-ink-muted">Datos personales borrados</span></span></span>`
              : `<a href="/u/${encodeURIComponent(u.username)}" data-link class="flex items-center gap-2 hover:text-secondary">${UI.avatar(u, 30)}<span><span class="block text-label-lg">@${UI.esc(u.username)}</span><span class="block text-body-sm text-ink-muted">${UI.esc(u.email)}</span></span></a>`}</td>
            <td class="font-mono text-primary">${u.karma_score}</td>
            <td>${self || deleted ? `<span class="${self ? 'chip-danger' : 'chip-neutral'}">${u.global_role}</span>` : `
              <select class="input w-auto py-1 text-body-sm" ${UI.on('change', 'AdminView.changeRole', u.id, u.username, UI.EL)} data-prev="${u.global_role}">
                ${['USER', 'COMMUNITY_MOD', 'GLOBAL_ADMIN'].map(r => `<option value="${r}" ${u.global_role === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>`}</td>
            <td>${deleted ? `<span class="chip-neutral">${UI.icon('person_remove', 'text-[13px]')} Eliminada</span>` : u.is_active ? '<span class="chip-primary">Activa</span>' : '<span class="chip-danger">Suspendida</span>'}</td>
            <td class="text-right"><span class="inline-flex items-center justify-end gap-1">${self || deleted ? '' : u.is_active
              ? `<button class="btn-danger-ghost btn-sm" ${UI.on('click', 'AdminView.suspend', u.id, u.username)}>${UI.icon('person_off', 'text-[16px]')} Suspender</button>`
              : `<button class="btn-secondary btn-sm" ${UI.on('click', 'AdminView.reactivate', u.id, u.username)}>${UI.icon('how_to_reg', 'text-[16px]')} Reactivar</button>`}
              ${canDelete ? `<button class="btn-icon text-danger hover:bg-danger/10 hover:text-danger" title="Eliminar cuenta" aria-label="Eliminar la cuenta de @${UI.esc(u.username)}" ${UI.on('click', 'AdminView.deleteUser', u.id, u.username)}>${UI.icon('delete_forever', 'text-[19px]')}</button>` : ''}
              ${!self && !deleted && u.global_role === 'GLOBAL_ADMIN' ? `<span class="btn-icon cursor-help text-ink-muted" title="Para eliminar a un administrador global, cámbiale antes el rol">${UI.icon('shield', 'text-[18px]')}</span>` : ''}</span></td>
          `;
        }).join('')}</tbody></table></div>` : UI.empty({ icon: 'person_search', title: 'Sin coincidencias' });
  },

  async changeRole(id, username, select) {
    const role = select.value;
    const ok = await UI.confirm({ title: `¿Cambiar el rol de @${username}?`, text: `Pasará a <strong class="text-ink">${role}</strong>. Recibirá una notificación y el cambio quedará en la auditoría administrativa.`, confirmText: 'Cambiar rol', icon: 'manage_accounts', tone: 'warning' });
    if (!ok) { select.value = select.dataset.prev; return; }
    try {
      await window.api.adminUpdateUserRole(id, role);
      select.dataset.prev = role;
      window.utils.showToast(`@${username} ahora es ${role}`, 'info');
    } catch (err) {
      select.value = select.dataset.prev;
      StatusView.toastError(err, 'No se pudo cambiar el rol');
    }
  },

  suspend(id, username) {
    UI.modal({
      title: `Suspender a @${username}`, icon: 'person_off', tone: 'danger',
      body: `<p>No podrá iniciar sesión hasta que se reactive la cuenta. El motivo se le mostrará al intentar entrar.</p>
        <div class="mt-4 text-left">${UI.field('suspend-reason', 'Motivo', { textarea: true, rows: 3, placeholder: 'Ej: Spam coordinado desde varias cuentas' })}</div>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-danger" ${UI.on('click', 'AdminView.confirmSuspend', UI.EL, id, username)}>Suspender cuenta</button>`
    });
  },

  async confirmSuspend(btn, id, username) {
    const reason = document.getElementById('suspend-reason').value.trim();
    if (!UI.setHint('suspend-reason', reason.length < 5 ? 'Explica el motivo (mínimo 5 caracteres).' : '')) return;
    btn.disabled = true;
    try {
      await window.api.adminUpdateUserStatus(id, false, reason);
      document.getElementById('ui-modal')?.remove();
      window.utils.showToast(`@${username} fue suspendido`, 'info');
      if (this.tab === 'users') this.loadUsers(); else this.sybil();
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo suspender');
    }
  },

  // Eliminar cuenta (solo GLOBAL_ADMIN): doble confirmación con motivo y nombre de usuario
  deleteUser(id, username) {
    UI.modal({
      title: `Eliminar la cuenta de @${username}`, icon: 'delete_forever', tone: 'danger',
      body: `
        <ul class="mb-4 flex flex-col gap-1.5 text-body-sm">
          <li class="flex gap-2">${UI.icon('person_off', 'text-[17px] text-danger')}Se borran su correo, foto, biografía y contraseña; nadie podrá volver a entrar con ella.</li>
          <li class="flex gap-2">${UI.icon('logout', 'text-[17px] text-warning')}Se cierran todas sus sesiones al instante.</li>
          <li class="flex gap-2">${UI.icon('article', 'text-[17px] text-ink-muted')}Sus publicaciones y comentarios se conservan como de «usuario eliminado».</li>
          <li class="flex gap-2">${UI.icon('receipt_long', 'text-[17px] text-ink-muted')}<span>Queda registrado en la auditoría administrativa. <strong class="text-ink">No se puede deshacer.</strong></span></li>
        </ul>
        <div class="text-left">
          ${UI.field('del-user-reason', 'Motivo', { textarea: true, rows: 2, placeholder: 'Ej: Cuenta de spam confirmada tras varias denuncias' })}
          ${UI.field('del-user-confirm', `Escribe <span class="font-mono text-ink">${UI.esc(username)}</span> para confirmar`, { attrs: `autocomplete="off" ${UI.on('input', 'AdminView.deleteReady', username)}` })}
        </div>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button>
        <button class="btn-danger" id="btn-del-user" disabled ${UI.on('click', 'AdminView.confirmDeleteUser', UI.EL, id, username)}>${UI.icon('delete_forever', 'text-[18px]')} Eliminar cuenta</button>`
    });
    document.getElementById('del-user-reason').focus();
  },

  deleteReady(username) {
    const ok = document.getElementById('del-user-confirm').value.trim().toLowerCase() === String(username).toLowerCase();
    document.getElementById('btn-del-user').disabled = !ok;
    return ok;
  },

  async confirmDeleteUser(btn, id, username) {
    const reason = document.getElementById('del-user-reason').value.trim();
    if (!UI.setHint('del-user-reason', reason.length < 5 ? 'Explica el motivo (mínimo 5 caracteres).' : '')) return;
    if (!this.deleteReady(username)) return;
    btn.disabled = true;
    try {
      const res = await window.api.adminDeleteUser(id, reason, document.getElementById('del-user-confirm').value.trim());
      document.getElementById('ui-modal')?.remove();
      window.utils.showToast(res.message || `La cuenta de @${username} fue eliminada`, 'info');
      this.loadUsers();
    } catch (err) {
      btn.disabled = false;
      if (err.status === 400) return UI.setHint(/confirmación|usuario/i.test(err.message) ? 'del-user-confirm' : 'del-user-reason', err.message);
      StatusView.toastError(err, 'No se pudo eliminar la cuenta');
    }
  },

  async reactivate(id, username) {
    const ok = await UI.confirm({ title: `¿Reactivar a @${username}?`, text: 'Podrá volver a iniciar sesión de inmediato.', confirmText: 'Reactivar', icon: 'how_to_reg', tone: 'primary' });
    if (!ok) return;
    try {
      await window.api.adminUpdateUserStatus(id, true, '');
      window.utils.showToast(`@${username} fue reactivado`, 'info');
      this.loadUsers();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo reactivar');
    }
  },

  // 05_45 Detección de cuentas sospechosas y Sybil
  async sybil() {
    this.threshold = this.threshold || 0.5;
    const data = await window.api.adminAccountGroups(this.threshold);
    const groups = data.groups || [];
    this.box().innerHTML = `
      <div class="card mb-4 flex flex-wrap items-center gap-4">
        <div class="flex-1"><h2 class="text-headline-sm">Umbral de riesgo</h2><p class="text-body-sm text-ink-secondary">Puntuación calculada a partir de la antigüedad de la cuenta, el karma y la actividad reciente.</p></div>
        <input type="range" min="0.1" max="0.95" step="0.05" value="${this.threshold}" class="w-48 accent-[#00e676]" ${UI.on('input', 'AdminView.previewThreshold', UI.EL)} ${UI.on('change', 'AdminView.setThreshold', UI.EL)}>
        <span id="thr-val" class="chip-warning font-mono">${Math.round(this.threshold * 100)}%</span>
      </div>
      ${groups.length ? `<div class="card overflow-x-auto p-0"><table class="table">
        <thead><tr><th>Cuenta</th><th>Riesgo</th><th>Publicaciones</th><th>Antigüedad</th><th></th></tr></thead>
        <tbody>${groups.map(g => {
          const pct = Math.round((g.risk_score || 0) * 100);
          const cls = pct >= 80 ? 'bg-danger' : pct >= 60 ? 'bg-warning' : 'bg-secondary';
          return `<tr>
            <td><a href="/u/${encodeURIComponent(g.username)}" data-link class="flex items-center gap-2 hover:text-secondary">${UI.avatar(g, 28)}@${UI.esc(g.username)}</a></td>
            <td><div class="flex items-center gap-2"><div class="h-2 w-24 overflow-hidden rounded-full bg-surface-base"><div class="h-full ${cls}" style="width:${pct}%"></div></div><span class="font-mono">${pct}%</span></div></td>
            <td class="font-mono">${g.post_count}</td>
            <td class="font-mono text-ink-muted">${g.days_old} días</td>
            <td class="text-right"><button class="btn-danger-ghost btn-sm" ${UI.on('click', 'AdminView.suspend', g.user_id, g.username)}>${UI.icon('person_off', 'text-[16px]')} Suspender</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>` : UI.empty({ icon: 'verified_user', title: 'Sin cuentas por encima del umbral', text: 'Baja el umbral para revisar cuentas con menor riesgo.' })}`;
  },

  // 05_46 Reindexación de recomendaciones y optimización del motor (Hot Ranking)
  async ranking() {
    const comms = await window.api.listCommunities().catch(() => []);
    this.box().innerHTML = `
      <div class="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div class="card">
          <h2 class="text-headline-md">Motor de ranking Hot</h2>
          <p class="mt-1 text-body-md text-ink-secondary">El feed “Para ti” ordena por votos netos atenuados por antigüedad:</p>
          <div class="mt-4 rounded border border-line bg-surface-base p-4 text-center font-mono text-headline-sm text-secondary">score = (votos+ − votos−) / (horas + 2)<sup>1.8</sup></div>
          <p class="mt-4 text-body-sm text-ink-secondary">El cálculo usa contadores guardados en cada publicación. Si se desfasan (cargas manuales, restauraciones o errores), el orden deja de ser fiel. La reindexación los vuelve a contar desde las tablas de votos y comentarios.</p>
        </div>
        <div class="card">
          <h2 class="text-headline-md">Reindexar</h2>
          <label class="label mt-3" for="reindex-scope">Alcance</label>
          <select id="reindex-scope" class="input"><option value="">Toda la plataforma</option>${comms.map(c => `<option value="${UI.esc(c.id)}">c/${UI.esc(c.name)}</option>`).join('')}</select>
          <button class="btn-primary mt-4 w-full" id="btn-reindex" ${UI.on('click', 'AdminView.reindex')}>${UI.icon('model_training', 'text-[18px]')} Recalcular contadores</button>
          <div id="reindex-result" class="mt-4"></div>
        </div>
      </div>`;
  },

  async reindex() {
    const btn = document.getElementById('btn-reindex');
    btn.disabled = true;
    btn.innerHTML = `${UI.icon('progress_activity', 'animate-spin text-[18px]')} Recalculando…`;
    try {
      const r = await window.api.adminReindex({ community_id: document.getElementById('reindex-scope').value });
      document.getElementById('reindex-result').innerHTML = `
        <div class="rounded border border-primary/30 bg-primary/5 p-4 text-body-sm">
          <div class="flex items-center gap-2 text-label-lg text-primary">${UI.icon('task_alt', 'text-[18px]')} Reindexación completada en ${r.duration_ms} ms</div>
          <ul class="mt-2 text-ink-secondary"><li>Publicaciones corregidas: <strong class="text-ink">${r.posts_fixed}</strong></li><li>Comentarios corregidos: <strong class="text-ink">${r.comments_fixed}</strong></li></ul>
        </div>`;
    } catch (err) {
      StatusView.toastError(err, 'No se pudo reindexar');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${UI.icon('model_training', 'text-[18px]')} Recalcular contadores`;
    }
  }
};
