/**
 * 02_11 Explorar comunidades y directorio temático, 02_12 Detalle de comunidad,
 * 02_12 Normativa comunitaria y código de conducta.
 * Incluye las barreras 06_76 comunidad restringida, 06_78 cuarentena (+18) y 06_81 suspensión local.
 * Conectada a /api/v1/communities, /:name, /:id/join y /:id/leave.
 */

window.CommunityView = {
  current: null,

  isMod() {
    const u = window.api.user;
    return !!u && ['COMMUNITY_MOD', 'GLOBAL_ADMIN'].includes(u.global_role);
  },

  // Gestiona la comunidad: moderación global, fundador o moderador local
  canManage(c) {
    const u = window.api.user;
    if (!u || !c) return false;
    return this.isMod() || c.creator_id === u.id || (c.moderators || []).some(m => m.user_id === u.id);
  },

  isOwner(c) {
    const u = window.api.user;
    return !!u && !!c && (c.creator_id === u.id || u.global_role === 'GLOBAL_ADMIN');
  },

  // Reglas: el texto se separa por líneas o por numeración "1." "2." …
  parseRules(text) {
    const clean = UI.plain(text || '').trim();
    if (!clean) return [];
    let parts = clean.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) parts = clean.split(/\s(?=\d+[.)]\s)/).map(s => s.trim()).filter(Boolean);
    return parts.map(p => p.replace(/^\d+[.)]\s*/, '').replace(/^[-*•]\s*/, ''));
  },

  defaultRules: ['Respeto mutuo y crítica constructiva', 'Sin spam ni autopromoción excesiva', 'Aporta contexto, fuentes y código reproducible'],

  founded(c) {
    return c.created_at ? new Date(c.created_at).toLocaleDateString('es', { month: 'long', year: 'numeric' }) : '';
  },

  // 02_11 Explorar comunidades
  async explore(query = {}) {
    this.exploreSort = query.sort || this.exploreSort || 'members';
    $main().innerHTML = `
      ${UI.pageHeader('Explorar comunidades', 'Encuentra espacios técnicos para debatir, aprender y compartir.', window.api.user ? `<a href="/c/create" data-link class="btn-primary">${UI.icon('add', 'text-[18px]')} Crear comunidad</a>` : '', 'explore')}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="relative min-w-[220px] flex-1">
          ${UI.icon('search', 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-muted')}
          <input id="comm-filter" class="input pl-10" placeholder="Filtrar por nombre o descripción…" value="${UI.esc(query.q || '')}" ${UI.on('input', 'CommunityView.paintDirectory')}>
        </div>
        <div id="comm-sort"></div>
      </div>
      <div id="comm-directory" class="grid gap-3 sm:grid-cols-2">${UI.skeletonPosts(4)}</div>`;
    this.paintExploreSort();
    try {
      this.directory = await window.api.listCommunities();
      this.paintDirectory();
    } catch (err) {
      document.getElementById('comm-directory').innerHTML = UI.error(err, () => CommunityView.explore());
    }
  },

  paintExploreSort() {
    document.getElementById('comm-sort').innerHTML = UI.tabs([
      { id: 'members', label: 'Más miembros', icon: 'groups' }, { id: 'new', label: 'Nuevas', icon: 'schedule' }, { id: 'az', label: 'A–Z', icon: 'sort_by_alpha' }
    ], this.exploreSort, 'CommunityView.setExploreSort');
  },

  setExploreSort(sort) {
    this.exploreSort = sort;
    this.paintExploreSort();
    this.paintDirectory();
  },

  paintDirectory() {
    const box = document.getElementById('comm-directory');
    if (!box || !this.directory) return;
    const q = (document.getElementById('comm-filter').value || '').trim().toLowerCase();
    const list = this.directory
      .filter(c => !q || `${c.name} ${UI.plain(c.description)}`.toLowerCase().includes(q))
      .sort({
        members: (a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0),
        new: (a, b) => new Date(b.created_at) - new Date(a.created_at),
        az: (a, b) => a.name.localeCompare(b.name)
      }[this.exploreSort]);
    if (!list.length) {
      box.className = '';
      box.innerHTML = UI.empty({ icon: 'search_off', title: 'Sin resultados', text: q ? `Ninguna comunidad coincide con “${UI.esc(q)}”.` : 'Todavía no hay comunidades.', action: window.api.user ? `<a href="/c/create" data-link class="btn-primary">Crear comunidad</a>` : '' });
      return;
    }
    box.className = 'grid gap-3 sm:grid-cols-2';
    box.innerHTML = list.map(c => `
      <a href="/c/${encodeURIComponent(c.name)}" data-link class="card card-hover flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface-elevated text-secondary">${UI.icon('tag')}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2"><span class="truncate font-display text-headline-sm">c/${UI.esc(c.name)}</span>
              ${c.is_private ? `<span class="chip-warning">${UI.icon('lock', 'text-[12px]')} Privada</span>` : ''}${c.age_restricted ? '<span class="chip-danger">+18</span>' : ''}</div>
            <div class="font-mono text-body-sm text-ink-muted">${c.subscribers_count || 0} miembros · desde ${this.founded(c)}</div>
          </div>
        </div>
        <p class="line-clamp-2 text-body-md text-ink-secondary">${UI.esc(c.description || 'Comunidad de Forfunable.')}</p>
      </a>`).join('');
  },

  // 02_12 Detalle de comunidad
  async render(name, query = {}) {
    $main().innerHTML = UI.skeletonPosts(2);
    let c;
    try {
      c = await window.api.getCommunity(name);
    } catch (err) {
      if (err.status === 404) return StatusView.page('community-404', { name });
      throw err;
    }
    this.current = c;
    const me = window.api.user;

    // 06_78 Cuarentena preventiva: contenido +18 exige mayoría de edad declarada
    if (c.age_restricted && !query.confirm18 && !(me && me.is_adult_verified)) {
      return this.quarantine(c);
    }

    // 06_79 / 06_80 Comunidad privada: quien no es miembro pide acceso
    const manage = this.canManage(c);
    const gated = c.is_private && !!me && !c.is_member && !manage;
    let pending = null;
    if (gated) {
      try { pending = (await window.api.myAccessRequests()).find(r => r.community_id === c.id && r.status === 'PENDING') || null; } catch (_) {}
    }
    this.pendingRequest = pending;

    $main().innerHTML = `
      <section class="overflow-hidden rounded-lg border border-line bg-surface-card">
        <div class="h-24 bg-[radial-gradient(circle_at_20%_20%,rgba(0,230,118,0.18),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.15),transparent_50%)]"></div>
        <div class="-mt-10 flex flex-wrap items-end gap-4 px-5 pb-5">
          <span class="flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-surface-elevated text-primary">${UI.icon('terminal', 'text-[38px]')}</span>
          <div class="min-w-0 flex-1">
            <h1 class="flex flex-wrap items-center gap-2 text-headline-xl">c/${UI.esc(c.name)}
              ${c.is_private ? `<span class="chip-warning">${UI.icon('lock', 'text-[12px]')} Privada</span>` : ''}${c.age_restricted ? '<span class="chip-danger">+18</span>' : ''}</h1>
            <div class="mt-1 flex flex-wrap gap-x-3 text-body-sm text-ink-secondary">
              <span><strong id="community-members-count" class="text-ink">${c.subscribers_count || 0}</strong> miembros</span>
              <span>·</span><span>Fundada en ${this.founded(c)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${gated
              ? (pending
                  ? `<a href="/requests" data-link id="btn-subscribe" class="btn-secondary">${UI.icon('hourglass_top', 'text-[18px]')} Solicitud enviada</a>`
                  : `<button id="btn-subscribe" class="btn-primary" ${UI.on('click', 'CommunityExtras.requestModal', c.id, c.name)}>${UI.icon('lock_open', 'text-[18px]')} Solicitar acceso</button>`)
              : `<button id="btn-subscribe" class="${c.is_member ? 'btn-secondary' : 'btn-primary'}" ${UI.on('click', 'CommunityView.toggleJoin', c.id, c.name, c.is_member)}>${c.is_member ? `${UI.icon('check', 'text-[18px]')} Miembro` : `${UI.icon('group_add', 'text-[18px]')} Unirme`}</button>`}
            ${manage ? `
              <div class="relative">
                <button class="btn-secondary px-2.5" ${UI.on('click', 'PostDetailView.toggleMenu', 'comm-menu')} aria-label="Gestionar">${UI.icon('more_horiz')}</button>
                <div id="comm-menu" class="panel absolute right-0 top-full z-20 mt-1 hidden w-60 p-1.5">
                  ${CommunityAdminView.links(c).map(([id, label, icon]) => `<a href="/c/${encodeURIComponent(c.name)}/${id}" data-link class="nav-item">${UI.icon(icon, 'text-[19px]')}${label}</a>`).join('')}
                </div>
              </div>` : ''}
          </div>
        </div>
      </section>
      <p class="mt-4 text-body-lg text-ink-secondary">${UI.esc(c.description || 'Comunidad técnica de Forfunable.')}</p>
      <div id="community-banner"></div>
      <div class="mt-4 flex justify-end">
        ${me && !gated ? `<a href="/submit?community=${encodeURIComponent(c.id)}" data-link class="btn-primary">${UI.icon('edit_square', 'text-[18px]')} Crear publicación en c/${UI.esc(c.name)}</a>` : ''}
      </div>
      <div id="community-feed" class="mt-4"></div>`;

    // 06_76 Comunidad privada: solo miembros ven el contenido
    if (c.is_private && !c.is_member && !manage) {
      document.getElementById('community-feed').innerHTML = CommunityExtras.gateCard(c, pending);
    } else {
      FeedView.renderCommunity(document.getElementById('community-feed'), c);
    }
    Router.setRail(this.aboutCard(c, false) + this.rulesCard(c) + this.modsCard(c));
  },

  aboutCard(c, withLink = true) {
    return `
      <div class="card">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface-elevated text-primary">${UI.icon('terminal')}</span>
          <div class="min-w-0"><a href="/c/${encodeURIComponent(c.name)}" data-link class="block truncate font-display text-headline-sm hover:text-secondary">c/${UI.esc(c.name)}</a><div class="text-body-sm text-ink-muted">Fundada en ${this.founded(c)}</div></div>
        </div>
        ${withLink ? `<p class="mt-3 text-body-sm text-ink-secondary">${UI.esc(c.description || '')}</p>` : ''}
        <div class="mt-3 grid grid-cols-2 gap-2 rounded bg-surface-base p-3">
          <div><div class="font-display text-headline-md">${c.subscribers_count || 0}</div><div class="text-body-sm text-ink-muted">Miembros</div></div>
          <div><div class="font-display text-headline-md">${(c.moderators || []).length}</div><div class="text-body-sm text-ink-muted">Moderadores</div></div>
        </div>
        ${withLink ? `<a href="/c/${encodeURIComponent(c.name)}" data-link class="btn-secondary mt-3 w-full">Ver comunidad</a>` : ''}
      </div>`;
  },

  rulesCard(c, max = 10) {
    const rules = this.parseRules(c.rules);
    const list = (rules.length ? rules : this.defaultRules).slice(0, max);
    return `
      <div class="card">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('gavel', 'text-secondary')} Reglas de la comunidad</h3>
          <span class="text-label-sm uppercase text-ink-muted">${list.length}</span>
        </div>
        <ol class="mt-3 flex flex-col gap-2">
          ${list.map((r, i) => `<li class="flex gap-2 rounded bg-surface-base px-3 py-2 text-body-sm"><span class="font-mono text-secondary">${i + 1}.</span><span>${UI.esc(r)}</span></li>`).join('')}
        </ol>
        <a href="/c/${encodeURIComponent(c.name)}/rules" data-link class="mt-3 flex items-center gap-1 text-body-sm text-secondary hover:underline">Código de conducta completo ${UI.icon('arrow_forward', 'text-[16px]')}</a>
      </div>`;
  },

  modsCard(c) {
    const mods = c.moderators || [];
    const label = { OWNER: 'Fundador', LEAD_MOD: 'Moderador principal', MOD: 'Moderador' };
    return `
      <div class="card">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('verified_user', 'text-primary')} Moderadores</h3>
          <span class="text-body-sm text-ink-muted">${mods.length} asignados</span>
        </div>
        <div class="mt-3 flex flex-col gap-2">
          ${mods.length ? mods.map(m => `
            <div class="flex items-center gap-3 rounded bg-surface-base px-3 py-2">
              ${UI.avatar({ username: m.username }, 32)}
              <div class="min-w-0 flex-1"><a href="/u/${encodeURIComponent(m.username || '')}" data-link class="block truncate text-label-lg hover:text-secondary">@${UI.esc(m.username || 'usuario')}</a><div class="text-body-sm text-ink-muted">${label[m.mod_role] || m.mod_role}</div></div>
              ${window.api.user && m.username && m.username !== window.api.user.username ? `<a href="/chat/new?to=${encodeURIComponent(m.username)}" data-link class="btn-icon" title="Enviar mensaje">${UI.icon('mail', 'text-[18px]')}</a>` : ''}
            </div>`).join('') : '<p class="text-body-sm text-ink-muted">El equipo global de moderación cuida esta comunidad.</p>'}
        </div>
      </div>`;
  },

  // 02_12 Normativa comunitaria y código de conducta técnico
  async rules(name) {
    let c;
    try { c = await window.api.getCommunity(name); } catch (err) {
      if (err.status === 404) return StatusView.page('community-404', { name });
      throw err;
    }
    const rules = this.parseRules(c.rules);
    const list = rules.length ? rules : this.defaultRules;
    $main().innerHTML = `
      <nav class="mb-3 flex items-center gap-1.5 text-body-sm text-ink-muted">
        <a href="/c/${encodeURIComponent(c.name)}" data-link class="text-secondary hover:underline">c/${UI.esc(c.name)}</a>${UI.icon('chevron_right', 'text-[16px]')}<span>Normativa</span>
      </nav>
      ${UI.pageHeader('Normativa y código de conducta', `Reglas que aplican a todas las publicaciones y comentarios de c/${UI.esc(c.name)}.`, this.isMod() ? `<a href="/c/${encodeURIComponent(c.name)}/settings" data-link class="btn-secondary">${UI.icon('edit', 'text-[18px]')} Editar reglas</a>` : '', 'gavel')}
      <div class="flex flex-col gap-3">
        ${list.map((r, i) => `
          <details class="card group" ${i === 0 ? 'open' : ''}>
            <summary class="flex cursor-pointer list-none items-center gap-3">
              <span class="flex h-8 w-8 items-center justify-center rounded bg-secondary/10 font-mono text-secondary">${i + 1}</span>
              <span class="flex-1 text-headline-sm">${UI.esc(r)}</span>
              ${UI.icon('expand_more', 'text-ink-muted transition-transform group-open:rotate-180')}
            </summary>
            <p class="mt-3 pl-11 text-body-md text-ink-secondary">Los moderadores pueden retirar el contenido que incumpla esta regla. Las infracciones repetidas pueden terminar en una sanción temporal o permanente en la comunidad.</p>
          </details>`).join('')}
      </div>
      <div class="card mt-4 border-secondary/30">
        <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('policy', 'text-secondary')} Cómo se aplican</h3>
        <ul class="mt-3 flex flex-col gap-2 text-body-md text-ink-secondary">
          <li class="flex gap-2">${UI.icon('flag', 'text-[18px] text-ink-muted')} Cualquier miembro puede reportar contenido; la denuncia llega a la cola de moderación.</li>
          <li class="flex gap-2">${UI.icon('gavel', 'text-[18px] text-ink-muted')} Los moderadores revisan, retiran el contenido o sancionan, y cada acción queda en el registro de auditoría.</li>
          <li class="flex gap-2">${UI.icon('notifications', 'text-[18px] text-ink-muted')} La persona afectada y quien denunció reciben una notificación con el resultado.</li>
        </ul>
      </div>
      <div class="mt-6"><a href="/c/${encodeURIComponent(c.name)}" data-link class="btn-secondary">${UI.icon('arrow_back', 'text-[18px]')} Volver a la comunidad</a></div>`;
    Router.setRail(this.aboutCard(c) + this.modsCard(c));
  },

  // Publicación o comentario de una comunidad privada sin acceso (403 PRIVATE_COMMUNITY)
  privateGate(message, name) {
    $main().innerHTML = `
      <div class="mx-auto max-w-xl py-8">${CommunityExtras.gateCard({ name: name || '', is_private: true }, null, message)}</div>`;
  },

  // 06_78 Comunidad en cuarentena preventiva (+18)
  quarantine(c) {
    const me = window.api.user;
    $main().innerHTML = `
      <div class="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
        <span class="flex h-20 w-20 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">${UI.icon('shield_lock', 'text-[36px]')}</span>
        <span class="chip-danger mt-6 uppercase tracking-wider">Contenido +18 · Cuarentena preventiva</span>
        <h1 class="mt-4 text-headline-xl">c/${UI.esc(c.name)} requiere mayoría de edad</h1>
        <p class="mt-3 text-body-lg text-ink-secondary">Esta comunidad está marcada como contenido restringido. Para entrar debes declarar que eres mayor de 18 años.</p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          ${me ? `<a href="/settings/age?next=${encodeURIComponent('/c/' + c.name)}" data-link class="btn-primary px-5">${UI.icon('verified', 'text-[18px]')} Verificar mi edad</a>` : `<a href="/login" data-link class="btn-primary px-5">Inicia sesión para verificar</a>`}
          <a href="/communities" data-link class="btn-secondary px-5">Explorar otras comunidades</a>
        </div>
      </div>`;
  },

  async toggleJoin(id, name, isMember) {
    if (!window.api.user) return StatusView.authModal('Inicia sesión para unirte a comunidades.');
    const btn = document.getElementById('btn-subscribe');
    if (btn) btn.disabled = true;
    try {
      if (isMember) {
        await window.api.leaveCommunity(id);
        window.utils.showToast(`Saliste de c/${name}`, 'info');
      } else {
        await window.api.joinCommunity(id);
        window.utils.showToast(`¡Te uniste a c/${name}!`, 'info');
      }
      UI.closeModal();
      Router.loadSidebarCommunities();
      if (window.location.pathname.startsWith('/c/')) await this.render(name, { confirm18: true });
    } catch (err) {
      if (btn) btn.disabled = false;
      // 06_81 Suspensión local en comunidad y modo lectura
      if (err.error === 'BANNED') return this.bannedBanner(name, err.message);
      StatusView.toastError(err, 'No se pudo actualizar la suscripción');
    }
  },

  bannedBanner(name, message) {
    const box = document.getElementById('community-banner');
    const html = `
      <div class="card mt-4 flex items-start gap-3 border-danger/30 bg-danger/5">
        <span class="text-danger">${UI.icon('block')}</span>
        <div><div class="text-label-lg text-danger">Estás sancionado en c/${UI.esc(name)} · modo solo lectura</div>
        <p class="mt-1 text-body-sm text-ink-secondary">${UI.esc(message || 'Un moderador restringió tu participación.')} Puedes leer el contenido, pero no publicar, comentar ni unirte mientras dure la sanción.</p></div>
      </div>`;
    if (box) box.innerHTML = html; else StatusView.toastError({ error: 'BANNED', message });
  }
};
