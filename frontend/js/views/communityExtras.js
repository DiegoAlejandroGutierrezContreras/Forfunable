/**
 * Funciones de comunidad extendidas:
 * 06_79 Solicitar acceso a comunidad privada, 06_80 Estado de la solicitud (y revisión por moderación),
 * 02_19 Gestión de flairs (crear, editar, ordenar, vista previa), 05_40 Transferir la propiedad.
 * Conectada a /api/v1/communities/:id/{join,flairs,access-requests,transfer} y /users/me/access-requests.
 */

window.CommunityExtras = {
  colors: [
    ['primary', 'Verde'], ['secondary', 'Azul'], ['tertiary', 'Violeta'], ['warning', 'Ámbar'], ['danger', 'Rojo'], ['neutral', 'Gris']
  ],

  unavailable(title = 'Función no disponible todavía') {
    return UI.unavailable(title);
  },

  // Carga la comunidad y comprueba que quien entra puede gestionarla
  async manageable(name, check = c => CommunityView.canManage(c)) {
    const c = await CommunityAdminView.load(name);
    if (!c) return null;
    if (!check(c)) { StatusView.page('403', { required: 'Fundador o moderador de la comunidad' }); return null; }
    return c;
  },

  // ---------- 06_79 Solicitar acceso ----------
  gateCard(c, pending, message = '') {
    const me = window.api.user;
    const name = UI.esc(c.name);
    return `
      <div class="card flex flex-col items-center px-6 py-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">${UI.icon('lock', 'text-[28px]')}</span>
        <span class="chip-warning mt-5 uppercase tracking-wider">Comunidad privada</span>
        <h3 class="mt-3 text-headline-md">${c.name ? `c/${name} es privada` : 'Contenido privado'}</h3>
        <p class="mt-1 max-w-md text-body-md text-ink-secondary">${message ? UI.esc(message) + '. ' : ''}Solo sus miembros ven las publicaciones. La moderación revisa cada solicitud de acceso.</p>
        ${!me ? `<a href="/login" data-link class="btn-primary mt-5">Inicia sesión para solicitar acceso</a>`
          : pending ? `
            <div class="mt-5 flex items-center gap-2 rounded border border-line bg-surface-base px-4 py-2 text-body-sm">${UI.icon('hourglass_top', 'text-[18px] text-warning')} Solicitud enviada ${window.utils.formatTime(pending.created_at)} · pendiente de revisión</div>
            <a href="/requests" data-link class="btn-ghost btn-sm mt-3">Ver mis solicitudes</a>`
          : c.id ? `<button class="btn-primary mt-5" ${UI.on('click', 'CommunityExtras.requestModal', c.id, c.name)}>${UI.icon('lock_open', 'text-[18px]')} Solicitar acceso</button>`
          : c.name ? `<a href="/c/${encodeURIComponent(c.name)}" data-link class="btn-primary mt-5">Ir a c/${name}</a>` : ''}
      </div>`;
  },

  requestModal(id, name) {
    if (!window.api.user) return StatusView.authModal('Inicia sesión para solicitar acceso.');
    const c = CommunityView.current && CommunityView.current.id === id ? CommunityView.current : { name };
    const rules = CommunityView.parseRules(c.rules).slice(0, 3);
    UI.modal({
      title: `Solicitar acceso a c/${UI.plain(name)}`, icon: 'lock_open', tone: 'warning',
      body: `<p class="mb-3">La moderación verá tu nombre de usuario, tu karma y este mensaje.</p>
        ${rules.length ? `<div class="mb-3 rounded border border-line bg-surface-base p-3 text-body-sm"><div class="mb-1 text-label-sm uppercase tracking-wider text-ink-muted">Normas que aceptas</div>${rules.map((r, i) => `<div><span class="font-mono text-secondary">${i + 1}.</span> ${UI.esc(r)}</div>`).join('')}</div>` : ''}
        <div class="mb-1.5 flex justify-between"><label class="label mb-0" for="req-msg">¿Por qué quieres unirte? (opcional)</label><span id="req-count" class="font-mono text-body-sm text-ink-muted">0 / 500</span></div>
        <textarea id="req-msg" class="input" rows="3" maxlength="500" placeholder="Ej: trabajo con Cloud Run a diario y quiero compartir mis despliegues" ${UI.on('input', 'UI.count', UI.EL, 'req-count', 500)}></textarea>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-primary" id="req-send" ${UI.on('click', 'CommunityExtras.sendRequest', id, name)}>Enviar solicitud</button>`
    });
    document.getElementById('req-msg').focus();
  },

  async sendRequest(id, name) {
    const btn = document.getElementById('req-send');
    btn.disabled = true;
    try {
      const res = await window.api.requestAccess(id, document.getElementById('req-msg').value.trim());
      UI.closeModal();
      if (res && res.status === 'PENDING') window.utils.showToast('Solicitud enviada: te avisaremos cuando la revisen', 'info');
      else { window.utils.showToast(`¡Te uniste a c/${name}!`, 'info'); Router.loadSidebarCommunities(); }
      if (window.location.pathname.startsWith('/c/')) CommunityView.render(name, { confirm18: true });
    } catch (err) {
      btn.disabled = false;
      if (err.error === 'BANNED') { UI.closeModal(); return CommunityView.bannedBanner(name, err.message); }
      StatusView.toastError(err, 'No se pudo enviar la solicitud');
    }
  },

  // ---------- 06_80 Mis solicitudes ----------
  statusInfo: {
    PENDING: ['chip-warning', 'Pendiente', 'hourglass_top', 'La moderación aún no la ha revisado.'],
    APPROVED: ['chip-primary', 'Aprobada', 'check_circle', 'Ya eres miembro.'],
    REJECTED: ['chip-danger', 'Rechazada', 'cancel', 'Puedes volver a solicitarlo más adelante.']
  },

  async myRequests() {
    $main().innerHTML = `
      ${UI.pageHeader('Mis solicitudes de acceso', 'Estado de tus peticiones para entrar en comunidades privadas.', '', 'lock_open')}
      <div id="my-requests" class="flex flex-col gap-3">${UI.skeletonPosts(2)}</div>`;
    const box = document.getElementById('my-requests');
    let list;
    try { list = await window.api.myAccessRequests(); } catch (err) {
      box.innerHTML = err.error === 'FEATURE_UNAVAILABLE' ? this.unavailable() : UI.error(err, () => CommunityExtras.myRequests());
      return;
    }
    if (!list.length) {
      box.innerHTML = UI.empty({ icon: 'lock_open', title: 'No has pedido acceso a ninguna comunidad', text: 'Las comunidades privadas aparecen con un candado en el directorio.', action: '<a href="/communities" data-link class="btn-primary">Explorar comunidades</a>' });
      return;
    }
    box.innerHTML = list.map(r => {
      const [chip, label, icon, hint] = this.statusInfo[r.status] || ['chip-neutral', r.status, 'help', ''];
      const steps = [
        ['send', 'Enviada', true, r.created_at],
        ['visibility', 'En revisión', true, null],
        [r.status === 'REJECTED' ? 'cancel' : 'check_circle', r.status === 'REJECTED' ? 'Rechazada' : 'Aprobada', r.status !== 'PENDING', r.decided_at]
      ];
      return `
        <article class="card">
          <div class="flex flex-wrap items-center gap-2">
            ${UI.communityChip(r.community_name)}
            <span class="${chip}">${UI.icon(icon, 'text-[13px]')}${label}</span>
            <span class="ml-auto text-body-sm text-ink-muted">${window.utils.formatTime(r.created_at)}</span>
          </div>
          <ol class="mt-4 grid grid-cols-3 gap-2">
            ${steps.map(([i, l, done, at], n) => `
              <li class="flex flex-col items-center text-center">
                <span class="flex h-8 w-8 items-center justify-center rounded-full ${done ? (n === 2 && r.status === 'REJECTED' ? 'bg-danger/15 text-danger' : 'bg-primary/15 text-primary') : n === 1 && r.status === 'PENDING' ? 'bg-warning/15 text-warning' : 'bg-surface-subtle text-ink-muted'}">${UI.icon(n === 1 && r.status === 'PENDING' ? 'hourglass_top' : i, 'text-[17px]')}</span>
                <span class="mt-1 text-label-md">${l}</span>
                ${at ? `<span class="font-mono text-label-sm text-ink-muted">${new Date(at).toLocaleDateString('es')}</span>` : ''}
              </li>`).join('')}
          </ol>
          ${r.message ? `<p class="mt-4 rounded border border-line bg-surface-base px-3 py-2 text-body-sm text-ink-secondary"><span class="text-ink-muted">Tu mensaje:</span> ${UI.esc(r.message)}</p>` : ''}
          ${r.decision_note ? `<p class="mt-2 text-body-sm"><span class="text-ink-muted">Nota de la moderación:</span> ${UI.esc(r.decision_note)}</p>` : ''}
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-body-sm text-ink-muted">
            <span>${hint}</span>
            ${r.status === 'APPROVED' ? `<a href="/c/${encodeURIComponent(r.community_name)}" data-link class="btn-primary btn-sm">Entrar en c/${UI.esc(r.community_name)}</a>`
              : r.status === 'REJECTED' ? `<a href="/c/${encodeURIComponent(r.community_name)}" data-link class="btn-secondary btn-sm">Ver comunidad</a>` : ''}
          </div>
        </article>`;
    }).join('');
  },

  // ---------- 06_80 Revisión de solicitudes (moderación) ----------
  async requests(name, query = {}) {
    const c = await this.manageable(name);
    if (!c) return;
    this.c = c;
    this.reqStatus = query.status || 'PENDING';
    $main().innerHTML = CommunityAdminView.header(c, 'requests') + `
      ${c.is_private ? '' : `<div class="card mb-4 flex items-start gap-3 border-warning/30">${UI.icon('info', 'text-warning')}<p class="text-body-sm text-ink-secondary">c/${UI.esc(c.name)} es pública: cualquiera puede unirse sin solicitud. ${CommunityView.isMod() ? `Hazla privada en <a href="/c/${encodeURIComponent(c.name)}/settings" data-link class="text-secondary hover:underline">Ajustes y gobernanza</a>.` : 'La moderación global puede hacerla privada.'}</p></div>`}
      <div id="req-tabs" class="mb-3"></div>
      <div id="req-list" class="flex flex-col gap-3">${UI.skeletonPosts(2)}</div>`;
    Router.setRail(CommunityView.aboutCard(c) + CommunityView.modsCard(c));
    this.loadRequests();
  },

  setReqStatus(s) {
    this.reqStatus = s;
    window.history.replaceState(null, '', `/c/${encodeURIComponent(this.c.name)}/requests?status=${s}`);
    this.loadRequests();
  },

  async loadRequests() {
    const box = document.getElementById('req-list');
    let list;
    try { list = await window.api.listAccessRequests(this.c.name, this.reqStatus === 'ALL' ? '' : this.reqStatus); } catch (err) {
      box.innerHTML = err.error === 'FEATURE_UNAVAILABLE' ? this.unavailable() : UI.error(err, () => CommunityExtras.loadRequests());
      return;
    }
    document.getElementById('req-tabs').innerHTML = UI.tabs([
      { id: 'PENDING', label: 'Pendientes', icon: 'hourglass_top', count: this.reqStatus === 'PENDING' ? list.length : null },
      { id: 'APPROVED', label: 'Aprobadas' }, { id: 'REJECTED', label: 'Rechazadas' }, { id: 'ALL', label: 'Todas' }
    ], this.reqStatus, 'CommunityExtras.setReqStatus');
    if (!list.length) {
      box.innerHTML = UI.empty({ icon: 'how_to_reg', title: this.reqStatus === 'PENDING' ? 'No hay solicitudes pendientes' : 'Sin solicitudes', text: 'Cuando alguien pida unirse aparecerá aquí y recibirás una notificación.' });
      return;
    }
    box.innerHTML = list.map(r => {
      const [chip, label] = this.statusInfo[r.status] || ['chip-neutral', r.status];
      const rank = UI.rank(r.user_karma || 0);
      return `
        <article class="card">
          <div class="flex flex-wrap items-center gap-3">
            ${UI.avatar({ username: r.username }, 40)}
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">${UI.userLink(r.username)}<span class="${chip}">${label}</span></div>
              <div class="font-mono text-body-sm text-ink-muted">${(r.user_karma || 0).toLocaleString('es')} karma · ${UI.esc(rank.name)} · ${window.utils.formatTime(r.created_at)}</div>
            </div>
          </div>
          <p class="mt-3 rounded border border-line bg-surface-base px-3 py-2 text-body-md ${r.message ? 'text-ink-secondary' : 'italic text-ink-muted'}">${r.message ? UI.esc(r.message) : 'Sin mensaje'}</p>
          ${r.status === 'PENDING' ? `
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <input id="note-${UI.esc(r.id)}" class="input flex-1 py-1.5 text-body-sm" placeholder="Nota para el solicitante (opcional, se envía si rechazas)">
              <button class="btn-danger-ghost btn-sm" ${UI.on('click', 'CommunityExtras.decide', r.id, 'REJECT')}>${UI.icon('close', 'text-[17px]')} Rechazar</button>
              <button class="btn-primary btn-sm" ${UI.on('click', 'CommunityExtras.decide', r.id, 'APPROVE')}>${UI.icon('check', 'text-[17px]')} Aprobar</button>
            </div>` : r.decision_note ? `<p class="mt-2 text-body-sm"><span class="text-ink-muted">Nota:</span> ${UI.esc(r.decision_note)}</p>` : ''}
        </article>`;
    }).join('');
  },

  async decide(id, action) {
    const note = (document.getElementById(`note-${id}`) || {}).value || '';
    try {
      await window.api.decideAccessRequest(this.c.id, id, action, note.trim());
      window.utils.showToast(action === 'APPROVE' ? 'Solicitud aprobada: ya es miembro' : 'Solicitud rechazada', 'info');
      this.loadRequests();
    } catch (err) { StatusView.toastError(err, 'No se pudo resolver la solicitud'); }
  },

  // ---------- 02_19 Flairs ----------
  async flairs(name) {
    const c = await this.manageable(name);
    if (!c) return;
    this.c = c;
    $main().innerHTML = CommunityAdminView.header(c, 'flairs') + `
      <div class="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div class="card p-0">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div><h2 class="text-headline-sm">Flairs de publicación</h2><p class="text-body-sm text-ink-secondary">Etiquetas para clasificar y filtrar el contenido de c/${UI.esc(c.name)}.</p></div>
            <button class="btn-primary btn-sm" ${UI.on('click', 'CommunityExtras.flairModal')}>${UI.icon('add', 'text-[18px]')} Nuevo flair</button>
          </div>
          <div id="flair-list">${UI.skeletonPosts(1)}</div>
        </div>
        <div class="flex flex-col gap-4">
          <div class="card">
            <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('tips_and_updates', 'text-warning')} Buenas prácticas</h3>
            <ul class="mt-3 flex flex-col gap-2 text-body-sm text-ink-secondary">
              <li>Usa pocos flairs (5–8) con nombres cortos.</li>
              <li>Reserva colores rojo y ámbar para avisos o anuncios.</li>
              <li>Marca «solo moderación» los flairs oficiales, como «Anuncio».</li>
              <li>El orden define cómo aparecen al publicar y en el filtro.</li>
            </ul>
          </div>
        </div>
      </div>`;
    this.loadFlairs();
  },

  async loadFlairs() {
    const box = document.getElementById('flair-list');
    try {
      const data = await window.api.listFlairs(this.c.name);
      this.flairList = data.items || [];
    } catch (err) {
      box.innerHTML = err.error === 'FEATURE_UNAVAILABLE' ? this.unavailable('Flairs no disponibles') : UI.error(err, () => CommunityExtras.loadFlairs());
      return;
    }
    const list = this.flairList;
    box.innerHTML = list.length ? `
      <ul class="divide-y divide-line">
        ${list.map((f, i) => `
          <li class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="flex flex-col">
              <button class="btn-icon p-0.5" ${i === 0 ? 'disabled' : ''} ${UI.on('click', 'CommunityExtras.moveFlair', i, -1)} aria-label="Subir">${UI.icon('keyboard_arrow_up', 'text-[18px]')}</button>
              <button class="btn-icon p-0.5" ${i === list.length - 1 ? 'disabled' : ''} ${UI.on('click', 'CommunityExtras.moveFlair', i, 1)} aria-label="Bajar">${UI.icon('keyboard_arrow_down', 'text-[18px]')}</button>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">${UI.flairChip(f)}${f.mod_only ? `<span class="chip-tertiary">${UI.icon('shield', 'text-[12px]')} Solo moderación</span>` : ''}</div>
              ${f.description ? `<p class="mt-1 text-body-sm text-ink-secondary">${UI.esc(f.description)}</p>` : ''}
            </div>
            <span class="font-mono text-body-sm text-ink-muted">${f.posts_count || 0} publicaciones</span>
            <button class="btn-ghost btn-sm" ${UI.on('click', 'CommunityExtras.flairModal', f.id)}>${UI.icon('edit', 'text-[17px]')} Editar</button>
            <button class="btn-icon text-danger" ${UI.on('click', 'CommunityExtras.deleteFlair', f.id)} aria-label="Eliminar">${UI.icon('delete', 'text-[18px]')}</button>
          </li>`).join('')}
      </ul>` : `<div class="p-4">${UI.empty({ icon: 'sell', title: 'Sin flairs todavía', text: 'Crea el primero: «Pregunta», «Tutorial», «Showcase»…', action: `<button class="btn-primary" ${UI.on('click', 'CommunityExtras.flairModal')}>Crear flair</button>` })}</div>`;
  },

  flairModal(id = '') {
    const f = (this.flairList || []).find(x => x.id === id) || { name: '', color: 'secondary', description: '', mod_only: false, position: (this.flairList || []).length };
    UI.modal({
      title: id ? 'Editar flair' : 'Nuevo flair', icon: 'sell', tone: 'secondary',
      body: `
        ${UI.field('fl-name', 'Nombre', { value: UI.plain(f.name), placeholder: 'Ej: Pregunta', attrs: `maxlength="30" ${UI.on('input', 'CommunityExtras.flairPreview')}` })}
        <label class="label">Color</label>
        <div class="mb-4 flex flex-wrap gap-2" id="fl-colors">
          ${this.colors.map(([v, l]) => `<button type="button" data-color="${v}" class="rounded-chip p-0.5 ${f.color === v ? 'ring-2 ring-primary' : ''}" ${UI.on('click', 'CommunityExtras.pickColor', v)}>${UI.flairChip({ name: l, color: v })}</button>`).join('')}
        </div>
        ${UI.field('fl-desc', 'Descripción (opcional)', { value: UI.plain(f.description), placeholder: 'Cuándo usar este flair', attrs: `maxlength="120" ${UI.on('input', 'CommunityExtras.flairPreview')}` })}
        <div class="mb-4 flex items-center justify-between gap-3 rounded border border-line bg-surface-base p-3">
          <div><div class="text-label-lg">Solo moderación</div><div class="text-body-sm text-ink-secondary">Los miembros no podrán elegirlo al publicar.</div></div>
          <button type="button" id="fl-mod" class="switch ${f.mod_only ? 'on' : ''}" ${UI.on('click', 'UI.toggleClass', UI.EL, 'on')} aria-label="Solo moderación"></button>
        </div>
        <div class="rounded border border-dashed border-line p-3">
          <div class="mb-2 text-label-sm uppercase tracking-wider text-ink-muted">Vista previa en una publicación</div>
          <div class="flex flex-wrap items-center gap-2 text-body-sm">${UI.communityChip(this.c.name)}<span id="fl-preview"></span></div>
          <div class="mt-1 font-display text-headline-sm">¿Cómo despliego Go en Cloud Run?</div>
        </div>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-primary" ${UI.on('click', 'CommunityExtras.saveFlair', id, f.position || 0)}>${id ? 'Guardar cambios' : 'Crear flair'}</button>`
    });
    this.flairColor = f.color || 'secondary';
    this.flairPreview();
    document.getElementById('fl-name').focus();
  },

  pickColor(v) {
    this.flairColor = v;
    document.querySelectorAll('#fl-colors [data-color]').forEach(b => b.classList.toggle('ring-2', b.dataset.color === v));
    document.querySelectorAll('#fl-colors [data-color]').forEach(b => b.classList.toggle('ring-primary', b.dataset.color === v));
    this.flairPreview();
  },

  flairPreview() {
    const name = document.getElementById('fl-name').value.trim() || 'Flair';
    document.getElementById('fl-preview').innerHTML = UI.flairChip({ name, color: this.flairColor, description: document.getElementById('fl-desc').value });
  },

  async saveFlair(id, position) {
    const name = document.getElementById('fl-name').value.trim();
    if (!UI.setHint('fl-name', name ? '' : 'Escribe el nombre del flair.')) return;
    const body = { name, color: this.flairColor, description: document.getElementById('fl-desc').value.trim(), mod_only: document.getElementById('fl-mod').classList.contains('on'), position };
    try {
      if (id) await window.api.updateFlair(this.c.id, id, body); else await window.api.createFlair(this.c.id, body);
      UI.closeModal();
      window.utils.showToast(id ? 'Flair actualizado' : 'Flair creado', 'info');
      this.loadFlairs();
    } catch (err) {
      if (err.status === 409 || err.status === 400) return UI.setHint('fl-name', err.message);
      StatusView.toastError(err, 'No se pudo guardar el flair');
    }
  },

  flairBody(f, position) {
    return { name: UI.plain(f.name), color: f.color || 'neutral', description: UI.plain(f.description || ''), mod_only: !!f.mod_only, position };
  },

  // Reordenar: intercambia la posición con el vecino y guarda ambos
  async moveFlair(i, dir) {
    const list = this.flairList;
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    const pa = i + dir, pb = i;
    try {
      await Promise.all([
        window.api.updateFlair(this.c.id, a.id, this.flairBody(a, pa)),
        window.api.updateFlair(this.c.id, b.id, this.flairBody(b, pb))
      ]);
      this.loadFlairs();
    } catch (err) { StatusView.toastError(err, 'No se pudo reordenar'); }
  },

  async deleteFlair(id) {
    const f = this.flairList.find(x => x.id === id);
    const ok = await UI.confirm({ title: `¿Eliminar «${UI.plain(f.name)}»?`, text: `${f.posts_count || 0} publicaciones perderán este flair. Las publicaciones no se borran.`, confirmText: 'Eliminar flair', danger: true, icon: 'sell' });
    if (!ok) return;
    try {
      await window.api.deleteFlair(this.c.id, id);
      window.utils.showToast('Flair eliminado', 'info');
      this.loadFlairs();
    } catch (err) { StatusView.toastError(err, 'No se pudo eliminar'); }
  },

  // ---------- 05_40 Transferir propiedad ----------
  async ownership(name) {
    const c = await this.manageable(name, x => CommunityView.isOwner(x));
    if (!c) return;
    this.c = c;
    const me = window.api.user;
    const owner = (c.moderators || []).find(m => m.mod_role === 'OWNER');
    const candidates = (c.moderators || []).filter(m => m.mod_role !== 'OWNER' && m.user_id !== c.creator_id);
    $main().innerHTML = CommunityAdminView.header(c, 'ownership') + `
      <div class="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div class="card border-warning/30 p-5 sm:p-6">
          <h2 class="flex items-center gap-2 text-headline-md">${UI.icon('swap_horiz', 'text-warning')} Transferir la propiedad</h2>
          <p class="mt-1 text-body-sm text-ink-secondary">La nueva persona fundadora tendrá control total de c/${UI.esc(c.name)}, incluida la posibilidad de volver a transferirla. ${c.creator_id === me.id ? 'Tú pasarás a ser moderador principal.' : 'El fundador actual pasará a ser moderador principal.'}</p>

          <div class="mt-5 flex items-center gap-3 rounded border border-line bg-surface-base p-3">
            ${UI.avatar({ username: owner ? owner.username : '?' }, 36)}
            <div class="flex-1"><div class="text-label-sm uppercase tracking-wider text-ink-muted">Fundador actual</div><div class="text-label-lg">${owner ? '@' + UI.esc(owner.username) : 'Sin registrar'}</div></div>
            ${UI.icon('arrow_downward', 'text-ink-muted')}
          </div>

          <div class="mt-4">${UI.field('own-user', 'Nuevo fundador (nombre de usuario)', { placeholder: 'usuario', attrs: `autocomplete="off" list="own-candidates" ${UI.on('input', 'CommunityExtras.ownReady')}`, help: 'Debe ser una cuenta activa. Se recomienda que ya sea moderador.' })}
            <datalist id="own-candidates">${candidates.map(m => `<option value="${UI.esc(m.username)}">`).join('')}</datalist>
            ${candidates.length ? `<div class="-mt-2 mb-4 flex flex-wrap gap-2">${candidates.map(m => `<button type="button" class="chip-neutral cursor-pointer py-1 hover:text-ink" ${UI.on('click', 'CommunityExtras.pickOwner', m.username)}>@${UI.esc(m.username)}</button>`).join('')}</div>` : ''}
          </div>
          ${UI.field('own-confirm', `Escribe <span class="font-mono text-ink">${UI.esc(c.name)}</span> para confirmar`, { attrs: `autocomplete="off" ${UI.on('input', 'CommunityExtras.ownReady')}` })}
          <div class="mt-6 flex justify-end gap-2 border-t border-line pt-5">
            <a href="/c/${encodeURIComponent(c.name)}" data-link class="btn-ghost">Cancelar</a>
            <button class="btn-danger px-5" id="btn-transfer" disabled ${UI.on('click', 'CommunityExtras.transfer', UI.EL)}>${UI.icon('swap_horiz', 'text-[18px]')} Transferir propiedad</button>
          </div>
        </div>
        <div class="card h-fit">
          <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('policy', 'text-secondary')} Qué cambia</h3>
          <ul class="mt-3 flex flex-col gap-2 text-body-sm text-ink-secondary">
            <li class="flex gap-2">${UI.icon('key', 'text-[16px] text-warning')}La nueva persona podrá gestionar flairs, solicitudes y el equipo.</li>
            <li class="flex gap-2">${UI.icon('shield_person', 'text-[16px] text-tertiary-soft')}Tú conservas la moderación como moderador principal.</li>
            <li class="flex gap-2">${UI.icon('receipt_long', 'text-[16px] text-ink-muted')}Queda en el registro de auditoría y se notifica a ambos.</li>
            <li class="flex gap-2">${UI.icon('undo', 'text-[16px] text-ink-muted')}Solo la nueva persona puede devolverte la propiedad.</li>
          </ul>
        </div>
      </div>`;
  },

  pickOwner(username) {
    document.getElementById('own-user').value = username;
    this.ownReady();
  },

  ownReady() {
    const ok = document.getElementById('own-user').value.trim() && document.getElementById('own-confirm').value.trim().toLowerCase() === this.c.name.toLowerCase();
    document.getElementById('btn-transfer').disabled = !ok;
    return ok;
  },

  async transfer(btn) {
    if (!this.ownReady()) return;
    const user = document.getElementById('own-user').value.trim().replace(/^@/, '');
    const ok = await UI.confirm({ title: `¿Transferir c/${this.c.name} a @${user}?`, text: 'Esta acción es inmediata. Solo la nueva persona fundadora podrá revertirla.', confirmText: 'Sí, transferir', danger: true, icon: 'swap_horiz' });
    if (!ok) return;
    btn.disabled = true;
    try {
      const res = await window.api.transferOwnership(this.c.id, user, document.getElementById('own-confirm').value.trim());
      window.utils.showToast(res.message || 'Propiedad transferida', 'info');
      Router.navigate(`/c/${encodeURIComponent(this.c.name)}`);
    } catch (err) {
      btn.disabled = false;
      if (err.status === 404) return UI.setHint('own-user', err.message);
      if (err.status === 400) return UI.setHint(/nombre de la comunidad|confirm/i.test(err.message) ? 'own-confirm' : 'own-user', err.message);
      StatusView.toastError(err, 'No se pudo transferir');
    }
  }
};
