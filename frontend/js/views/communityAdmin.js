/**
 * Gestión de comunidad para moderadores:
 * 05_40 Ajustes y gobernanza, 05_39 Asignar moderador y permisos de equipo,
 * 05_37 Sancionar y levantar sanción, 05_38 Registro y gestión de sanciones.
 * Conectada a /api/v1/admin/communities/:id/* y /api/v1/admin/moderation/actions/*.
 */

window.CommunityAdminView = {
  async load(name) {
    try {
      this.c = await window.api.getCommunity(name);
      return this.c;
    } catch (err) {
      if (err.status === 404) { StatusView.page('community-404', { name }); return null; }
      throw err;
    }
  },

  // Pestañas visibles: las de moderación global y las del fundador o moderador local
  links(c) {
    const tabs = [];
    if (CommunityView.isMod()) {
      tabs.push(['settings', 'Ajustes y gobernanza', 'tune'], ['moderators', 'Moderadores', 'shield_person'], ['bans', 'Sanciones', 'block']);
    }
    if (CommunityView.canManage(c)) {
      tabs.push(['flairs', 'Flairs', 'sell'], ['requests', 'Solicitudes de acceso', 'lock_open']);
    }
    if (CommunityView.isOwner(c)) tabs.push(['ownership', 'Transferir propiedad', 'swap_horiz']);
    return tabs;
  },

  header(c, active) {
    const tabs = this.links(c);
    return `
      <nav class="mb-3 flex items-center gap-1.5 text-body-sm text-ink-muted">
        <a href="/c/${encodeURIComponent(c.name)}" data-link class="text-secondary hover:underline">c/${UI.esc(c.name)}</a>${UI.icon('chevron_right', 'text-[16px]')}<span>Gestión</span>
      </nav>
      ${UI.pageHeader(`Gestión de c/${UI.plain(c.name)}`, 'Herramientas de moderación. Cada cambio queda en el registro de auditoría.', '', 'admin_panel_settings')}
      <div class="mb-4 flex flex-wrap gap-1 rounded-lg border border-line bg-surface-card p-1.5">
        ${tabs.map(([id, label, icon]) => `<a href="/c/${encodeURIComponent(c.name)}/${id}" data-link class="tab ${id === active ? 'active' : ''}">${UI.icon(icon, 'text-[17px]')}${label}</a>`).join('')}
      </div>`;
  },

  // 05_40 Ajustes y gobernanza de comunidad
  async settings(name) {
    const c = await this.load(name);
    if (!c) return;
    const toggle = (id, on, title, text, icon) => `
      <div class="flex items-start justify-between gap-4 rounded border border-line bg-surface-base p-4">
        <div class="flex gap-3">${UI.icon(icon, 'text-ink-secondary')}<div><div class="text-label-lg">${title}</div><div class="text-body-sm text-ink-secondary">${text}</div></div></div>
        <button type="button" id="${id}" class="switch ${on ? 'on' : ''}" onclick="this.classList.toggle('on')" aria-label="${title}"></button>
      </div>`;
    $main().innerHTML = this.header(c, 'settings') + `
      <div class="card p-5 sm:p-6">
        <h2 class="text-headline-md">Gobernanza</h2>
        <p class="mt-1 text-body-sm text-ink-secondary">Define las reglas visibles para todos los miembros y el nivel de acceso.</p>
        <div class="mt-5">${UI.field('set-rules', 'Reglas de la comunidad', { textarea: true, rows: 6, value: UI.plain(c.rules || ''), placeholder: '1. Respeto mutuo\n2. Código reproducible', help: 'Una regla por línea. Se muestran numeradas en la comunidad y en cada publicación.' })}</div>
        <div class="flex flex-col gap-3">
          ${toggle('set-private', c.is_private, 'Comunidad privada', 'Solo los miembros pueden ver las publicaciones. El resto verá la pantalla de comunidad restringida.', 'lock')}
          ${toggle('set-age', c.age_restricted, 'Contenido +18 (cuarentena)', 'Antes de entrar se exige haber declarado la mayoría de edad.', 'shield_lock')}
        </div>
        <div class="mt-6 flex justify-end gap-2 border-t border-line pt-5">
          <a href="/c/${encodeURIComponent(c.name)}" data-link class="btn-ghost">Cancelar</a>
          <button class="btn-primary px-5" onclick="CommunityAdminView.saveSettings(this)">${UI.icon('save', 'text-[18px]')} Guardar ajustes</button>
        </div>
      </div>`;
    Router.setRail(CommunityView.aboutCard(c) + CommunityView.modsCard(c));
  },

  async saveSettings(btn) {
    btn.disabled = true;
    try {
      await window.api.adminUpdateCommunitySettings(this.c.id, {
        rules_text: document.getElementById('set-rules').value.trim(),
        is_private: document.getElementById('set-private').classList.contains('on'),
        age_restricted: document.getElementById('set-age').classList.contains('on')
      });
      window.utils.showToast('Ajustes de la comunidad guardados', 'info');
      Router.navigate(`/c/${encodeURIComponent(this.c.name)}`);
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudieron guardar los ajustes');
    }
  },

  // 05_39 Asignar moderador y gestión de permisos de equipo
  async moderators(name) {
    const c = await this.load(name);
    if (!c) return;
    const roles = { OWNER: ['Fundador', 'Control total, incluida la asignación de moderadores'], LEAD_MOD: ['Moderador principal', 'Edita ajustes y reglas, sanciona y resuelve reportes'], MOD: ['Moderador', 'Retira contenido y sanciona'] };
    $main().innerHTML = this.header(c, 'moderators') + `
      <div class="card mb-4 p-5">
        <h2 class="text-headline-md">Asignar moderador</h2>
        <p class="mt-1 text-body-sm text-ink-secondary">Solo el fundador o un administrador global pueden asignar moderadores.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-start">
          <div>${UI.field('mod-user', 'Usuario', { placeholder: 'nombre_de_usuario' })}</div>
          <div class="mb-4"><label class="label" for="mod-role">Rol</label>
            <select id="mod-role" class="input">${Object.entries(roles).reverse().map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <button class="btn-primary sm:mt-6" onclick="CommunityAdminView.assign(this)">${UI.icon('person_add', 'text-[18px]')} Asignar</button>
        </div>
        <div class="grid gap-2 sm:grid-cols-3">
          ${Object.entries(roles).map(([k, [l, d]]) => `<div class="rounded bg-surface-base p-3"><div class="text-label-md text-ink">${l}</div><div class="mt-0.5 text-body-sm text-ink-muted">${d}</div></div>`).join('')}
        </div>
      </div>
      <div class="card p-0">
        <div class="border-b border-line px-4 py-3 text-headline-sm">Equipo actual (${(c.moderators || []).length})</div>
        ${(c.moderators || []).length ? `<table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Desde</th></tr></thead><tbody>
          ${c.moderators.map(m => `<tr><td><a href="/u/${encodeURIComponent(m.username || '')}" data-link class="flex items-center gap-2 hover:text-secondary">${UI.avatar({ username: m.username }, 26)}@${UI.esc(m.username || 'usuario')}</a></td>
            <td><span class="${m.mod_role === 'OWNER' ? 'chip-primary' : 'chip-tertiary'}">${(roles[m.mod_role] || [m.mod_role])[0]}</span></td>
            <td class="text-ink-muted">${new Date(m.assigned_at).toLocaleDateString('es')}</td></tr>`).join('')}
        </tbody></table>` : '<p class="p-4 text-body-sm text-ink-muted">Aún no hay moderadores asignados.</p>'}
      </div>`;
    Router.setRail(CommunityView.aboutCard(c));
  },

  async resolveUser(field) {
    const username = document.getElementById(field).value.trim().replace(/^@|^u\//, '');
    if (!username) { UI.setHint(field, 'Escribe el nombre de usuario.'); return null; }
    try {
      const u = await window.api.getPublicProfile(username);
      UI.setHint(field, '');
      return u;
    } catch (_) {
      UI.setHint(field, `No existe el usuario @${username}.`);
      return null;
    }
  },

  async assign(btn) {
    const user = await this.resolveUser('mod-user');
    if (!user) return;
    btn.disabled = true;
    try {
      await window.api.adminAssignModerator(this.c.id, user.id, document.getElementById('mod-role').value);
      window.utils.showToast(`@${user.username} ahora modera c/${this.c.name}`, 'info');
      this.moderators(this.c.name);
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo asignar');
    }
  },

  // 05_37 Sancionar / levantar sanción y 05_38 registro de sanciones
  async bans(name) {
    const c = await this.load(name);
    if (!c) return;
    $main().innerHTML = this.header(c, 'bans') + `
      <div class="card mb-4 p-5">
        <h2 class="flex items-center gap-2 text-headline-md">${UI.icon('gavel', 'text-danger')} Sancionar a un miembro</h2>
        <p class="mt-1 text-body-sm text-ink-secondary">La persona podrá leer, pero no publicar, comentar ni unirse mientras dure la sanción.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div>${UI.field('ban-user', 'Usuario', { placeholder: 'nombre_de_usuario' })}</div>
          <div class="mb-4"><label class="label" for="ban-days">Duración</label>
            <select id="ban-days" class="input"><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="0">Permanente</option></select></div>
        </div>
        ${UI.field('ban-reason', 'Motivo (visible en el registro)', { textarea: true, rows: 2, placeholder: 'Ej: Spam reiterado tras dos advertencias (regla 2)' })}
        <div class="flex justify-end"><button class="btn-danger" onclick="CommunityAdminView.ban(this)">${UI.icon('block', 'text-[18px]')} Aplicar sanción</button></div>
      </div>
      <div class="card mb-4 p-0">
        <div class="border-b border-line px-4 py-3 text-headline-sm">Sanciones vigentes</div>
        <div id="bans-list">${UI.skeletonPosts(1)}</div>
      </div>
      <div class="card p-0">
        <div class="border-b border-line px-4 py-3 text-headline-sm">Historial de la comunidad</div>
        <div id="bans-history" class="p-4 text-body-sm text-ink-muted">Cargando…</div>
      </div>`;
    Router.setRail(CommunityView.aboutCard(c) + CommunityView.rulesCard(c, 5));
    this.loadBans();
  },

  async loadBans() {
    const box = document.getElementById('bans-list');
    try {
      const bans = await window.api.adminListBans(this.c.id);
      box.innerHTML = bans.length ? `<table class="table"><thead><tr><th>Usuario</th><th>Motivo</th><th>Vence</th><th></th></tr></thead><tbody>
        ${bans.map(b => `<tr>
          <td><a href="/u/${encodeURIComponent(b.username || '')}" data-link class="flex items-center gap-2 hover:text-secondary">${UI.avatar({ username: b.username }, 26)}@${UI.esc(b.username)}</a></td>
          <td class="max-w-[260px] text-ink-secondary">${UI.esc(b.reason)}</td>
          <td class="whitespace-nowrap">${b.expires_at ? `<span class="chip-warning">${new Date(b.expires_at).toLocaleDateString('es')}</span>` : '<span class="chip-danger">Permanente</span>'}</td>
          <td class="text-right"><button class="btn-secondary btn-sm" onclick="CommunityAdminView.unban(${UI.arg(b.user_id)}, ${UI.arg(b.username)})">${UI.icon('lock_open', 'text-[16px]')} Levantar</button></td>
        </tr>`).join('')}</tbody></table>` : '<p class="p-4 text-body-sm text-ink-muted">No hay sanciones vigentes.</p>';
    } catch (err) {
      box.innerHTML = `<div class="p-4">${UI.esc(err.message || 'No se pudieron cargar las sanciones')}</div>`;
    }
    const hist = document.getElementById('bans-history');
    try {
      const logs = (await window.api.adminGetAuditLogs(200)).filter(l => ['BAN_USER', 'UNBAN_USER'].includes(l.action_type) && l.community_id === this.c.id);
      hist.className = logs.length ? '' : 'p-4 text-body-sm text-ink-muted';
      hist.innerHTML = logs.length ? `<ul class="divide-y divide-line">${logs.map(l => `
        <li class="flex items-start gap-3 px-4 py-3 text-body-sm">
          <span class="${l.action_type === 'BAN_USER' ? 'text-danger' : 'text-primary'}">${UI.icon(l.action_type === 'BAN_USER' ? 'block' : 'lock_open', 'text-[18px]')}</span>
          <span class="flex-1"><strong>${l.action_type === 'BAN_USER' ? 'Sanción' : 'Sanción levantada'}</strong> por @${UI.esc(l.moderator_username || 'moderador')} · <span class="text-ink-secondary">${UI.esc(l.reason)}</span></span>
          <span class="whitespace-nowrap text-ink-muted">${window.utils.formatTime(l.created_at)}</span>
        </li>`).join('')}</ul>` : 'Sin movimientos registrados.';
    } catch (_) {
      hist.textContent = 'Sin acceso al historial.';
    }
  },

  async ban(btn) {
    const user = await this.resolveUser('ban-user');
    if (!user) return;
    const reason = document.getElementById('ban-reason').value.trim();
    if (!UI.setHint('ban-reason', reason ? '' : 'Explica el motivo de la sanción.')) return;
    const days = Number(document.getElementById('ban-days').value);
    const ok = await UI.confirm({
      title: `¿Sancionar a @${user.username}?`,
      text: `${days ? `Durante ${days} ${days === 1 ? 'día' : 'días'}` : 'De forma permanente'} no podrá participar en c/${UI.esc(this.c.name)}.`,
      confirmText: 'Sancionar', danger: true, icon: 'gavel'
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await window.api.adminBan(user.id, this.c.id, reason, days);
      window.utils.showToast(`@${user.username} fue sancionado`, 'info');
      this.bans(this.c.name);
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo aplicar la sanción');
    }
  },

  async unban(userId, username) {
    const ok = await UI.confirm({ title: `¿Levantar la sanción de @${username}?`, text: 'Podrá volver a publicar y comentar en la comunidad de inmediato.', confirmText: 'Levantar sanción', icon: 'lock_open', tone: 'primary' });
    if (!ok) return;
    try {
      await window.api.adminUnban(userId, this.c.id, 'Sanción levantada por moderación');
      window.utils.showToast('Sanción levantada', 'info');
      this.loadBans();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo levantar la sanción');
    }
  }
};
