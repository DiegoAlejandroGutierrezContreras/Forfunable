/**
 * Moderación del lado del usuario:
 * 06_84 Modal de reporte de infracción, 06_83 Confirmación de reporte de vulnerabilidad técnica,
 * 04_24 Reporte enviado y seguimiento de expediente, 04_25 Proponer nota comunitaria,
 * 04_24/04_26 Gobernanza y evaluación de notas (matriz de consenso), 06_93 Retirada forzosa
 * con justificación y 06_92 Notificación de advertencia disciplinaria.
 */

window.ModerationView = {
  RECEIPT_KEY: 'forfunable_reports',
  NOTE_MIN_KARMA: 50,

  reasons: [
    { code: 'SPAM', label: 'Spam o autopromoción', desc: 'Publicidad, enlaces repetidos o contenido sin aporte.', icon: 'campaign' },
    { code: 'ACOSO', label: 'Acoso o ataque personal', desc: 'Insultos, hostigamiento o amenazas a una persona.', icon: 'person_alert' },
    { code: 'CONTENIDO_OFENSIVO', label: 'Contenido ofensivo', desc: 'Lenguaje discriminatorio, violento o explícito.', icon: 'report' },
    { code: 'DESINFORMACION', label: 'Desinformación técnica', desc: 'Datos falsos o engañosos presentados como hechos.', icon: 'fact_check' },
    { code: 'VULNERABILIDAD', label: 'Vulnerabilidad o datos sensibles', desc: 'Credenciales, exploits activos o datos personales expuestos.', icon: 'bug_report' },
    { code: 'OTRO', label: 'Otro motivo', desc: 'Incumple las normas de la comunidad de otra forma.', icon: 'more_horiz' }
  ],

  // 06_84 Modal de reporte de infracción de contenido
  reportModal(targetId, targetType) {
    if (!window.api.user) return StatusView.authModal('Inicia sesión para reportar contenido.');
    this.pending = { targetId, targetType, reason: null };
    UI.modal({
      title: `Reportar ${targetType === 'POST' ? 'publicación' : 'comentario'}`, icon: 'flag', tone: 'danger', size: 'max-w-xl',
      body: `
        <p>Tu denuncia llega a la cola de moderación. Quien publicó no sabrá quién lo reportó.</p>
        <div class="mt-4 grid gap-2 text-left sm:grid-cols-2" id="report-reasons">
          ${this.reasons.map(r => `
            <button type="button" data-reason="${r.code}" class="flex items-start gap-2 rounded border border-line bg-surface-base p-3 text-left transition-colors hover:border-line-strong" onclick="ModerationView.pickReason('${r.code}')">
              ${UI.icon(r.icon, 'text-[18px] text-ink-secondary')}<span><span class="block text-label-lg text-ink">${r.label}</span><span class="block text-body-sm text-ink-muted">${r.desc}</span></span>
            </button>`).join('')}
        </div>
        <div class="field-hint" id="report-reason-hint"></div>
        <div class="mt-4 text-left">${UI.field('report-desc', 'Detalle para los moderadores (opcional)', { textarea: true, rows: 3, placeholder: 'Ej: la clave de API aparece en la línea 12 del bloque de código' })}</div>`,
      actions: `<button class="btn-ghost" onclick="UI.closeModal()">Cancelar</button><button class="btn-danger" onclick="ModerationView.submitReport(this)">${UI.icon('send', 'text-[18px]')} Enviar denuncia</button>`
    });
  },

  pickReason(code) {
    this.pending.reason = code;
    document.querySelectorAll('#report-reasons [data-reason]').forEach(b => {
      const on = b.dataset.reason === code;
      b.classList.toggle('border-danger', on);
      b.classList.toggle('bg-danger/5', on);
    });
    document.getElementById('report-reason-hint').innerHTML = '';
  },

  async submitReport(btn) {
    const p = this.pending;
    if (!p.reason) {
      document.getElementById('report-reason-hint').innerHTML = `${UI.icon('info', 'text-[15px]')}<span>Elige un motivo.</span>`;
      return;
    }
    const description = document.getElementById('report-desc').value.trim();
    // 06_83 Confirmación adicional para reportes de vulnerabilidad técnica
    if (p.reason === 'VULNERABILIDAD' && !p.confirmedVuln) {
      const desc = description;
      const ok = await UI.confirm({
        title: '¿Reportar una vulnerabilidad?',
        text: `<p>Si el contenido expone credenciales o un exploit activo, los moderadores lo retirarán con prioridad.</p>
          <ul class="mt-3 list-disc pl-5 text-body-sm"><li>No copies la información sensible en el detalle.</li><li>Si es una clave tuya, revócala ya mismo en su proveedor.</li></ul>`,
        confirmText: 'Sí, reportar con prioridad', icon: 'bug_report', danger: true
      });
      if (!ok) return;
      p.confirmedVuln = true;
      return this.sendReport(desc);
    }
    btn.disabled = true;
    return this.sendReport(description);
  },

  async sendReport(description) {
    const p = this.pending;
    try {
      const report = await window.api.createReport(p.targetId, p.targetType, p.reason, description);
      const receipts = this.receipts();
      receipts[report.id] = { ...report, saved_at: Date.now(), from: window.location.pathname };
      try { localStorage.setItem(this.RECEIPT_KEY, JSON.stringify(receipts)); } catch (_) {}
      document.getElementById('ui-modal')?.remove();
      Router.navigate(`/reports/${report.id}`);
    } catch (err) {
      StatusView.toastError(err, 'No se pudo enviar la denuncia');
    }
  },

  receipts() {
    try { return JSON.parse(localStorage.getItem(this.RECEIPT_KEY) || '{}'); } catch (_) { return {}; }
  },

  // 04_24 Reporte enviado y seguimiento de expediente
  reportReceipt(id) {
    const r = this.receipts()[id];
    if (!r) return StatusView.page('404', { what: 'report', title: 'Expediente no disponible', text: 'Solo puedes consultar aquí las denuncias enviadas desde este navegador. Te avisaremos por notificación cuando se resuelvan.' });
    const reason = this.reasons.find(x => x.code === r.reason_code) || { label: r.reason_code };
    const steps = [
      ['Denuncia recibida', `Registrada ${window.utils.formatTime(new Date(r.saved_at).toISOString())}`, true],
      ['En revisión', 'Un moderador evaluará el contenido frente a las normas', r.status !== 'PENDING'],
      ['Resolución', 'Recibirás una notificación con el resultado', ['ACTIONED', 'DISMISSED'].includes(r.status)]
    ];
    $main().innerHTML = `
      <div class="mx-auto max-w-2xl">
        <div class="card flex flex-col items-center px-6 py-8 text-center">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">${UI.icon('task_alt', 'text-[30px]')}</span>
          <h1 class="mt-4 text-headline-lg">Denuncia enviada</h1>
          <p class="mt-1 text-body-md text-ink-secondary">Gracias por cuidar la comunidad. Tu identidad no se comparte con quien publicó.</p>
          <span class="chip-neutral mt-4 font-mono">Expediente ${UI.esc(id.slice(0, 8).toUpperCase())}</span>
        </div>
        <div class="card mt-4 grid gap-3 text-body-sm sm:grid-cols-3">
          <div><div class="text-label-sm uppercase text-ink-muted">Motivo</div><div class="mt-1 text-label-lg">${UI.esc(reason.label)}</div></div>
          <div><div class="text-label-sm uppercase text-ink-muted">Tipo</div><div class="mt-1 text-label-lg">${r.target_type === 'POST' ? 'Publicación' : 'Comentario'}</div></div>
          <div><div class="text-label-sm uppercase text-ink-muted">Estado</div><div class="mt-1"><span class="chip-warning">Pendiente</span></div></div>
          ${r.description ? `<div class="sm:col-span-3"><div class="text-label-sm uppercase text-ink-muted">Detalle</div><p class="mt-1 text-ink-secondary">${UI.esc(r.description)}</p></div>` : ''}
        </div>
        <div class="card mt-4">
          <h2 class="text-headline-sm">Seguimiento</h2>
          <ol class="mt-4 flex flex-col gap-4">
            ${steps.map(([t, d, done], i) => `
              <li class="flex gap-3">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-primary text-primary-ink' : 'border border-line-strong text-ink-muted'}">${done ? UI.icon('check', 'text-[16px]') : i + 1}</span>
                <span><span class="block text-label-lg ${done ? 'text-ink' : 'text-ink-secondary'}">${t}</span><span class="block text-body-sm text-ink-muted">${d}</span></span>
              </li>`).join('')}
          </ol>
        </div>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <a href="${UI.esc(r.from || '/')}" data-link class="btn-primary">${UI.icon('arrow_back', 'text-[18px]')} Volver al contenido</a>
          <a href="/notifications" data-link class="btn-secondary">Ver mis notificaciones</a>
        </div>
      </div>`;
  },

  // 04_24 / 04_26 Notas comunitarias y matriz de consenso dentro del post
  async notesBlock(post) {
    const box = document.getElementById('post-notes');
    if (!box) return;
    let notes = [];
    try { notes = await window.api.listCommunityNotes(post.id); } catch (_) { return; }
    if (!notes.length) { box.innerHTML = ''; return; }
    const me = window.api.user;
    box.innerHTML = notes.map(n => {
      const total = n.helpful_votes + n.unhelpful_votes;
      const pct = total ? Math.round(n.helpful_votes / total * 100) : 0;
      // Verificada: al menos 3 evaluaciones y 70 % de consenso
      const verified = total >= 3 && pct >= 70;
      const rejected = total >= 3 && pct < 40;
      const state = verified ? ['Contexto verificado', 'text-primary', 'border-primary/30', 'verified'] : rejected ? ['Sin consenso', 'text-danger', 'border-danger/30', 'block'] : ['En evaluación', 'text-warning', 'border-warning/30', 'pending'];
      const mine = me && me.id === n.author_id;
      return `
        <div class="rounded-md border ${state[2]} bg-surface-base p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-2 text-label-lg ${state[1]}">${UI.icon(state[3], 'text-[18px]')} Nota comunitaria · ${state[0]}</span>
            <span class="chip-community font-mono">Consenso ${pct}% · ${total} ${total === 1 ? 'voto' : 'votos'}</span>
          </div>
          <p class="mt-2 text-body-md text-ink">${UI.esc(n.note_text)}</p>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-danger/30"><div class="h-full bg-primary" style="width:${total ? pct : 0}%"></div></div>
          <div class="mt-3 flex flex-wrap items-center gap-3 text-body-sm">
            ${n.proof_url ? `<a href="${UI.esc(n.proof_url)}" target="_blank" rel="noopener noreferrer nofollow" class="flex items-center gap-1 text-secondary hover:underline">${UI.icon('open_in_new', 'text-[15px]')} Fuente</a>` : '<span class="text-ink-muted">Sin fuente adjunta</span>'}
            <span class="text-ink-muted">· propuesta por @${UI.esc(n.author_username || 'usuario')}</span>
            <span class="ml-auto flex items-center gap-1">
              ${mine ? '<span class="text-ink-muted">Tu nota</span>' : `
              <span class="text-ink-muted">¿Fue útil?</span>
              <button class="btn-ghost btn-sm ${n.user_vote === 1 ? 'text-primary' : ''}" onclick="ModerationView.voteNote(${UI.arg(n.id)}, true)">${UI.icon('thumb_up', 'text-[16px]')} ${n.helpful_votes}</button>
              <button class="btn-ghost btn-sm ${n.user_vote === -1 ? 'text-danger' : ''}" onclick="ModerationView.voteNote(${UI.arg(n.id)}, false)">${UI.icon('thumb_down', 'text-[16px]')} ${n.unhelpful_votes}</button>`}
            </span>
          </div>
        </div>`;
    }).join('<div class="h-3"></div>');
  },

  async voteNote(noteId, helpful) {
    if (!window.api.user) return StatusView.authModal('Inicia sesión para evaluar notas comunitarias.');
    try {
      await window.api.voteCommunityNote(noteId, helpful);
      window.utils.showToast('Evaluación registrada', 'info');
      this.notesBlock(PostDetailView.post);
    } catch (err) {
      StatusView.toastError(err, 'No se pudo registrar la evaluación');
    }
  },

  // 04_25 Proponer nota comunitaria de precisión técnica
  proposeNote(postId) {
    const me = window.api.user;
    if (!me) return StatusView.authModal('Inicia sesión para proponer notas comunitarias.');
    const allowed = me.karma_score >= this.NOTE_MIN_KARMA || me.global_role === 'GLOBAL_ADMIN';
    UI.modal({
      title: 'Proponer nota comunitaria', icon: 'fact_check', tone: 'secondary', size: 'max-w-xl',
      body: allowed ? `
        <p>Las notas añaden contexto verificable a una publicación. Se muestran como “verificadas” cuando la mayoría las considera útiles.</p>
        <ul class="mt-3 flex flex-col gap-1 text-left text-body-sm text-ink-muted">
          <li class="flex gap-2">${UI.icon('check', 'text-[16px] text-primary')} Neutral y basada en hechos comprobables</li>
          <li class="flex gap-2">${UI.icon('check', 'text-[16px] text-primary')} Con una fuente primaria (documentación, RFC, benchmark)</li>
          <li class="flex gap-2">${UI.icon('close', 'text-[16px] text-danger')} Sin opiniones ni ataques al autor</li>
        </ul>
        <div class="mt-4 text-left">
          <div class="mb-1.5 flex justify-between"><label class="label mb-0" for="note-text">Contexto adicional</label><span id="note-count" class="font-mono text-body-sm text-ink-muted">0 / 1000</span></div>
          <textarea id="note-text" class="input" rows="4" maxlength="1000" placeholder="Ej: El benchmark se ejecutó con Linux 6.8 y BPF activo; con kernels anteriores la mejora es menor." oninput="document.getElementById('note-count').textContent = this.value.length + ' / 1000'"></textarea>
          <div class="field-hint" id="note-text-hint"></div>
          <div class="mt-3">${UI.field('note-proof', 'Fuente (enlace)', { type: 'url', placeholder: 'https://…' })}</div>
        </div>` : `
        <p>Para proponer notas necesitas al menos <strong class="text-ink">${this.NOTE_MIN_KARMA} de karma</strong>. Tienes ${me.karma_score}.</p>
        <p class="mt-2">Sigue aportando publicaciones y comentarios útiles: cuando otros los voten, ganarás reputación.</p>`,
      actions: allowed ? `<button class="btn-ghost" onclick="UI.closeModal()">Cancelar</button><button class="btn-primary" onclick="ModerationView.submitNote(this, ${UI.arg(postId)})">${UI.icon('send', 'text-[18px]')} Proponer nota</button>`
        : `<button class="btn-primary" onclick="UI.closeModal()">Entendido</button>`
    });
  },

  async submitNote(btn, postId) {
    const text = document.getElementById('note-text').value.trim();
    const proof = document.getElementById('note-proof').value.trim();
    if (!UI.setHint('note-text', text.length < 5 ? 'Escribe al menos 5 caracteres de contexto.' : '')) return;
    if (!UI.setHint('note-proof', proof && !/^https?:\/\/\S+\.\S+/i.test(proof) ? 'La fuente debe ser un enlace https://' : '')) return;
    btn.disabled = true;
    try {
      await window.api.createCommunityNote(postId, text, proof);
      document.getElementById('ui-modal')?.remove();
      window.utils.showToast('Nota propuesta: la comunidad la evaluará', 'info');
      if (PostDetailView.post) this.notesBlock(PostDetailView.post);
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo proponer la nota');
    }
  },

  // 06_93 Modal de retirada forzosa de contenido con justificación
  forceRemove(targetId, targetType) {
    UI.modal({
      title: `Retirar ${targetType === 'POST' ? 'publicación' : 'comentario'} por moderación`, icon: 'gavel', tone: 'danger',
      body: `
        <p>El contenido dejará de mostrarse y su autor recibirá un aviso con la justificación. La acción queda en el registro de auditoría.</p>
        <div class="mt-4 text-left">
          <label class="label" for="remove-rule">Norma incumplida</label>
          <select id="remove-rule" class="input mb-3">${this.reasons.map(r => `<option value="${UI.esc(r.label)}">${r.label}</option>`).join('')}</select>
          ${UI.field('remove-reason', 'Justificación (visible para el autor)', { textarea: true, rows: 3, placeholder: 'Explica qué parte incumple la norma' })}
        </div>`,
      actions: `<button class="btn-ghost" onclick="UI.closeModal()">Cancelar</button><button class="btn-danger" onclick="ModerationView.confirmRemove(this, ${UI.arg(targetId)})">${UI.icon('gavel', 'text-[18px]')} Retirar contenido</button>`
    });
  },

  async confirmRemove(btn, targetId) {
    const reason = document.getElementById('remove-reason').value.trim();
    if (!UI.setHint('remove-reason', reason.length < 5 ? 'Escribe una justificación (mínimo 5 caracteres).' : '')) return;
    btn.disabled = true;
    try {
      await window.api.request(`/admin/moderation/content/${targetId}/remove?reason=${encodeURIComponent(`${document.getElementById('remove-rule').value}: ${reason}`)}`, { method: 'DELETE' });
      document.getElementById('ui-modal')?.remove();
      window.utils.showToast('Contenido retirado y autor notificado', 'info');
      Router.handleRoute();
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo retirar el contenido');
    }
  },

  // 06_92 Notificación de advertencia disciplinaria oficial
  async notice(id) {
    const notifs = await window.api.listNotifications();
    const n = notifs.find(x => x.id === id);
    if (!n) return StatusView.page('404', { what: 'notice', title: 'Aviso no encontrado' });
    if (!n.is_read) { try { await window.api.markNotificationRead(id); Router.refreshBadges(); } catch (_) {} }
    const removal = /retirad/i.test(n.title + n.message);
    const target = NotificationsView.linkFor(n.type);
    $main().innerHTML = `
      <div class="mx-auto max-w-2xl">
        <div class="card overflow-hidden p-0">
          <div class="flex items-center gap-3 border-b border-line ${removal ? 'bg-danger/10' : 'bg-secondary/10'} px-5 py-4">
            <span class="${removal ? 'text-danger' : 'text-secondary'}">${UI.icon(removal ? 'gpp_bad' : 'shield', 'text-[28px]')}</span>
            <div><div class="text-label-sm uppercase tracking-wider text-ink-muted">${removal ? 'Advertencia disciplinaria oficial' : 'Aviso de la administración'}</div><h1 class="text-headline-md">${UI.esc(n.title)}</h1></div>
          </div>
          <div class="p-5">
            <p class="text-body-lg">${UI.esc(n.message)}</p>
            <div class="mt-4 font-mono text-body-sm text-ink-muted">Emitido ${new Date(n.created_at).toLocaleString('es')} · Ref. ${UI.esc(n.id.slice(0, 8).toUpperCase())}</div>
            ${removal ? `
              <div class="mt-5 rounded border border-line bg-surface-base p-4 text-body-sm text-ink-secondary">
                <div class="text-label-lg text-ink">¿Qué significa?</div>
                <ul class="mt-2 list-disc pl-5"><li>El contenido ya no es visible para la comunidad.</li><li>Las infracciones repetidas pueden terminar en una sanción en la comunidad o en la suspensión de la cuenta.</li><li>Revisa la normativa de la comunidad antes de volver a publicar.</li></ul>
              </div>` : ''}
          </div>
        </div>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          ${target && target !== '/profile' ? `<a href="${target}" data-link class="btn-secondary">Ver el contexto</a>` : ''}
          <a href="/notifications" data-link class="btn-primary">${UI.icon('arrow_back', 'text-[18px]')} Volver a notificaciones</a>
        </div>
      </div>`;
  }
};
