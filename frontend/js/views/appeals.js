/**
 * 01_11 Historial de sanciones y apelaciones: lo que la moderación decidió sobre tu cuenta,
 * con la posibilidad de pedir una revisión. Conectada a /api/v1/users/me/sanctions y /api/v1/appeals.
 */

window.AppealsView = {
  kinds: {
    COMMUNITY_BAN: { icon: 'block', label: 'Sanción en comunidad' },
    CONTENT_REMOVAL: { icon: 'delete', label: 'Contenido retirado' }
  },
  statusChip: {
    PENDING: ['chip-warning', 'En revisión', 'hourglass_top'],
    ACCEPTED: ['chip-primary', 'Aceptada', 'check_circle'],
    REJECTED: ['chip-danger', 'Rechazada', 'cancel']
  },

  async render() {
    $main().innerHTML = `
      ${UI.pageHeader('Sanciones y apelaciones', 'Las decisiones de moderación sobre tu cuenta. Si crees que hubo un error, pide una revisión: la resolverá otra persona del equipo.', '', 'gavel')}
      <div id="appeals-body">${UI.skeletonPosts(2)}</div>`;
    let list, appeals = [];
    try { [list, appeals] = await Promise.all([window.api.mySanctions(), window.api.myAppeals()]); } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') {
        document.getElementById('appeals-body').innerHTML = UI.unavailable('Función no disponible todavía');
        return;
      }
      document.getElementById('appeals-body').innerHTML = UI.error(err, () => AppealsView.render());
      return;
    }
    this.list = list;
    // Apelaciones cuya sanción ya no existe (p. ej. se aceptó y se levantó la sanción)
    const linked = new Set(list.filter(s => s.appeal).map(s => s.appeal.id));
    const resolved = appeals.filter(a => !linked.has(a.id));
    const active = list.filter(s => s.active).length;
    const pending = list.filter(s => s.appeal && s.appeal.status === 'PENDING').length;
    const stat = (label, value, icon, cls) => `<div class="card flex items-center gap-3"><span class="flex h-10 w-10 items-center justify-center rounded bg-surface-elevated ${cls}">${UI.icon(icon)}</span><div><div class="font-display text-headline-md">${value}</div><div class="text-body-sm text-ink-muted">${label}</div></div></div>`;
    document.getElementById('appeals-body').innerHTML = `
      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        ${stat('Sanciones vigentes', active, 'block', active ? 'text-danger' : 'text-ink-muted')}
        ${stat('Apelaciones en revisión', pending, 'hourglass_top', pending ? 'text-warning' : 'text-ink-muted')}
        ${stat('Registros totales', list.length, 'history', 'text-secondary')}
      </div>
      ${list.length ? `<ol class="relative flex flex-col gap-3 border-l border-line pl-5">${list.map(s => this.item(s)).join('')}</ol>` : UI.empty({ icon: 'verified_user', title: 'Sin sanciones vigentes', text: resolved.length ? 'Tus apelaciones resueltas aparecen abajo.' : 'No tienes sanciones ni contenido retirado. ¡Sigue así!' })}
      ${resolved.length ? `
        <h2 class="mb-3 mt-6 flex items-center gap-2 text-headline-md">${UI.icon('task_alt', 'text-primary')} Apelaciones resueltas</h2>
        <div class="flex flex-col gap-3">${resolved.map(a => this.resolvedItem(a)).join('')}</div>` : ''}
      <div class="card mt-4 flex items-start gap-3 text-body-sm text-ink-secondary">
        ${UI.icon('info', 'text-secondary')}
        <p>Solo se admite una apelación por decisión. Si se acepta, la sanción se levanta o la publicación vuelve a estar visible automáticamente y te avisaremos en notificaciones.</p>
      </div>`;
  },

  item(s) {
    const k = this.kinds[s.kind] || { icon: 'gavel', label: s.kind };
    const a = s.appeal;
    const st = a && this.statusChip[a.status];
    const canAppeal = !a; // una apelación por decisión
    return `
      <li class="relative">
        <span class="absolute -left-[29px] top-4 h-3 w-3 rounded-full border-2 border-surface-base ${s.active ? 'bg-danger' : 'bg-ink-muted'}"></span>
        <article class="card">
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex items-center gap-1.5 text-label-lg">${UI.icon(k.icon, `text-[18px] ${s.active ? 'text-danger' : 'text-ink-muted'}`)}${k.label}</span>
            ${s.community_name ? UI.communityChip(s.community_name) : ''}
            <span class="${s.active ? 'chip-danger' : 'chip-neutral'}">${s.active ? 'Vigente' : s.kind === 'COMMUNITY_BAN' ? 'Finalizada' : 'Registrada'}</span>
            <span class="ml-auto text-body-sm text-ink-muted" title="${new Date(s.created_at).toLocaleString('es')}">${window.utils.formatTime(s.created_at)}</span>
          </div>
          <p class="mt-2 text-body-md text-ink-secondary">${UI.esc(s.reason || 'Sin motivo indicado')}</p>
          ${s.expires_at ? `<p class="mt-1 font-mono text-body-sm text-ink-muted">${s.active ? 'Termina' : 'Terminó'} el ${new Date(s.expires_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</p>` : s.kind === 'COMMUNITY_BAN' && s.active ? '<p class="mt-1 font-mono text-body-sm text-ink-muted">Sin fecha de fin</p>' : ''}
          ${a ? `
            <div class="mt-4 rounded border border-line bg-surface-base p-3">
              <div class="flex flex-wrap items-center gap-2 text-body-sm"><span class="text-label-lg">Tu apelación</span><span class="${st[0]}">${UI.icon(st[2], 'text-[13px]')}${st[1]}</span><span class="ml-auto text-ink-muted">${window.utils.formatTime(a.created_at)}</span></div>
              <p class="mt-2 text-body-sm text-ink-secondary">${UI.esc(a.message)}</p>
              ${a.resolution ? `<p class="mt-2 border-t border-line pt-2 text-body-sm"><span class="text-ink-muted">Respuesta del equipo:</span> ${UI.esc(a.resolution)}</p>` : ''}
            </div>` : ''}
          ${canAppeal && (s.active || s.kind === 'CONTENT_REMOVAL') ? `
            <div class="mt-4 flex justify-end"><button class="btn-secondary" ${UI.on('click', 'AppealsView.appealModal', s.kind, s.reference_id)}>${UI.icon('gavel', 'text-[18px]')} Apelar esta decisión</button></div>` : ''}
        </article>
      </li>`;
  },

  resolvedItem(a) {
    const k = this.kinds[a.kind] || { icon: 'gavel', label: a.kind };
    const st = this.statusChip[a.status] || this.statusChip.PENDING;
    return `
      <article class="card">
        <div class="flex flex-wrap items-center gap-2">
          <span class="flex items-center gap-1.5 text-label-lg">${UI.icon(k.icon, 'text-[18px] text-ink-muted')}${k.label}</span>
          ${a.community_name ? UI.communityChip(a.community_name) : ''}
          <span class="${st[0]}">${UI.icon(st[2], 'text-[13px]')}${st[1]}</span>
          <span class="ml-auto text-body-sm text-ink-muted">${window.utils.formatTime(a.resolved_at || a.created_at)}</span>
        </div>
        <p class="mt-2 text-body-sm text-ink-secondary"><span class="text-ink-muted">Tu apelación:</span> ${UI.esc(a.message)}</p>
        ${a.resolution ? `<p class="mt-2 rounded border border-line bg-surface-base px-3 py-2 text-body-sm"><span class="text-ink-muted">Respuesta del equipo:</span> ${UI.esc(a.resolution)}</p>` : ''}
        ${a.status === 'ACCEPTED' ? `<p class="mt-2 flex items-center gap-1.5 text-body-sm text-primary">${UI.icon('check_circle', 'text-[16px]')}${a.kind === 'COMMUNITY_BAN' ? 'La sanción se levantó.' : 'La publicación se restauró.'}</p>` : ''}
      </article>`;
  },

  onType(el) { UI.count(el, 'appeal-count', 2000); UI.setHint('appeal-msg', ''); },

  appealModal(kind, ref) {
    const s = this.list.find(x => x.reference_id === ref);
    UI.modal({
      title: 'Apelar decisión', icon: 'gavel', tone: 'secondary',
      body: `<p class="mb-3">${this.kinds[kind].label}${s && s.community_name ? ` en c/${UI.esc(s.community_name)}` : ''}: «${UI.esc(s ? s.reason : '')}».</p>
        <div class="mb-1.5 flex justify-between"><label class="label mb-0" for="appeal-msg">Explica por qué crees que debe revisarse</label><span id="appeal-count" class="font-mono text-body-sm text-ink-muted">0 / 2000</span></div>
        <textarea id="appeal-msg" class="input" rows="5" maxlength="2000" placeholder="Aporta contexto: qué pasó, enlaces o pruebas. Sé concreto y respetuoso." ${UI.on('input', 'AppealsView.onType', UI.EL)}></textarea>
        <div class="field-hint" id="appeal-msg-hint"></div>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-primary" id="appeal-send" ${UI.on('click', 'AppealsView.send', kind, ref)}>Enviar apelación</button>`
    });
    document.getElementById('appeal-msg').focus();
  },

  async send(kind, ref) {
    const msg = document.getElementById('appeal-msg').value.trim();
    if (!UI.setHint('appeal-msg', msg.length >= 10 ? '' : 'Escribe al menos 10 caracteres.')) return;
    const btn = document.getElementById('appeal-send');
    btn.disabled = true;
    try {
      await window.api.createAppeal(kind, ref, msg);
      UI.closeModal();
      window.utils.showToast('Apelación enviada: te avisaremos cuando se resuelva', 'info');
      this.render();
    } catch (err) {
      btn.disabled = false;
      if (err.status === 409 || err.status === 400) return UI.setHint('appeal-msg', err.message);
      StatusView.toastError(err, 'No se pudo enviar la apelación');
    }
  }
};
