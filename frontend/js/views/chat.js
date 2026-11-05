/**
 * 04_27 Nueva solicitud de chat y regla de presentación, 04_28 Bandeja de solicitudes,
 * 04_29/04_30 Mensajería privada y conversación (actualización periódica cada 5 s).
 * Conectada a /api/v1/chats/requests y /api/v1/chats/conversations.
 */

window.ChatView = {
  conversations: [],
  activeId: null,
  timer: null,

  stopPolling() {
    clearInterval(this.timer);
    this.timer = null;
    this.closeMenu && this.closeMenu();
  },

  layout(inner, side) {
    return `
      <div class="grid h-[calc(100vh-7rem)] min-h-[520px] gap-4 md:grid-cols-[320px_1fr]">
        <aside class="card flex min-h-0 flex-col p-0 ${this.activeId ? 'hidden md:flex' : 'flex'}">
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <h1 class="text-headline-md">Mensajes</h1>
            <a href="/chat/new" data-link class="btn-primary btn-sm">${UI.icon('edit_square', 'text-[16px]')} Nuevo</a>
          </div>
          <a href="/chat/requests" data-link class="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-surface-elevated">
            ${UI.icon('move_to_inbox', 'text-secondary')}<span class="flex-1 text-label-lg">Solicitudes</span><span id="chat-req-count" class="chip-community hidden"></span>${UI.icon('chevron_right', 'text-ink-muted')}
          </a>
          <div class="p-3"><input class="input py-2 text-body-sm" placeholder="Buscar conversación…" ${UI.on('input', 'ChatView.filterList', UI.VALUE)}></div>
          <div id="conversations-list" class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">${side || '<div class="skeleton mx-2 h-12"></div>'}</div>
        </aside>
        <section class="card flex min-h-0 flex-col p-0 ${this.activeId ? 'flex' : 'hidden md:flex'}">${inner}</section>
      </div>`;
  },

  async render(convId) {
    this.stopPolling();
    this.activeId = convId;
    $main().innerHTML = this.layout(convId ? `<div class="flex flex-1 items-center justify-center text-ink-muted">${UI.icon('progress_activity', 'animate-spin')}</div>` : `
      <div class="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated text-ink-secondary">${UI.icon('forum', 'text-[28px]')}</span>
        <h2 class="mt-4 text-headline-md">Tus conversaciones privadas</h2>
        <p class="mt-1 max-w-sm text-body-md text-ink-secondary">Elige un chat de la izquierda o envía una solicitud de presentación a otro miembro.</p>
        <a href="/chat/new" data-link class="btn-primary mt-5">${UI.icon('person_add', 'text-[18px]')} Nueva solicitud</a>
      </div>`);
    await this.loadList();
    this.loadRequestCount();
    if (convId) await this.openConversation(convId);
  },

  async loadList() {
    const box = document.getElementById('conversations-list');
    try {
      this.conversations = await window.api.listConversations();
      this.paintList(this._filter || '');
    } catch (err) {
      box.innerHTML = `<p class="p-3 text-body-sm text-danger">${UI.esc(err.message || 'Error al cargar chats')}</p>`;
    }
  },

  // Marcas estilo WhatsApp: ✓ enviado, ✓✓ entregado (gris), ✓✓ leído (azul), reloj = enviando
  ticks(status, cls = 'text-[15px]') {
    if (!status) return '';
    const map = {
      pending: ['schedule', 'text-ink-muted', 'Enviando'],
      sent: ['done', 'text-ink-muted', 'Enviado'],
      delivered: ['done_all', 'text-ink-muted', 'Entregado'],
      read: ['done_all', 'text-secondary', 'Leído']
    };
    const [icon, color, label] = map[status] || map.sent;
    return `<span class="icon ${cls} ${color} leading-none" title="${label}" aria-label="${label}" data-status="${status}">${icon}</span>`;
  },

  paintList(filter = '') {
    const box = document.getElementById('conversations-list');
    if (!box) return;
    this._filter = filter;
    const list = this.conversations.filter(c => !filter || (c.other_username || '').toLowerCase().includes(filter.toLowerCase()));
    box.innerHTML = list.length ? list.map(c => {
      const active = c.id === this.activeId;
      const unread = !active && c.unread_count > 0;
      const preview = c.last_message_deleted
        ? `<span class="flex items-center gap-1 italic text-ink-muted">${UI.icon('block', 'text-[14px]')}${c.last_message_mine ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}</span>`
        : `<span class="flex min-w-0 items-center gap-1">${c.last_message_mine ? this.ticks(c.last_message_status) : ''}${c.last_attachment_kind ? UI.icon(this.kindIcon(c.last_attachment_kind), 'text-[15px] text-ink-muted') : ''}<span class="truncate">${UI.esc(c.last_message || (c.last_attachment_kind ? this.kindLabel(c.last_attachment_kind, c.last_attachment_name) : 'Conversación iniciada'))}</span></span>`;
      return `
      <a href="/chat/${encodeURIComponent(c.id)}" data-link data-conv="${UI.esc(c.id)}" class="flex items-center gap-3 rounded px-2 py-2.5 transition-colors ${active ? 'bg-surface-elevated' : 'hover:bg-surface-subtle'}">
        ${UI.avatar({ username: c.other_username }, 40)}
        <span class="min-w-0 flex-1">
          <span class="flex items-center justify-between gap-2">
            <span class="truncate text-label-lg ${active ? 'text-primary' : unread ? 'font-semibold text-ink' : ''}">@${UI.esc(c.other_username || 'usuario')}</span>
            <span class="shrink-0 text-body-sm ${unread ? 'font-semibold text-primary' : 'text-ink-muted'}">${this.listTime(c.last_message_at || c.updated_at)}</span>
          </span>
          <span class="flex items-center justify-between gap-2 text-body-sm ${unread ? 'text-ink' : 'text-ink-secondary'}">
            ${preview}
            ${unread ? `<span class="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-ink" aria-label="${c.unread_count} sin leer">${c.unread_count > 99 ? '99+' : c.unread_count}</span>` : ''}
          </span>
        </span>
      </a>`;
    }).join('') : `<p class="p-3 text-center text-body-sm text-ink-muted">${filter ? 'Sin coincidencias.' : 'Aún no tienes conversaciones.'}</p>`;
  },

  // Hora en la bandeja: hoy → 14:05, ayer → "Ayer", esta semana → día, si no → fecha
  listTime(iso) {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (diff === 1) return 'Ayer';
    if (diff < 7) return d.toLocaleDateString('es', { weekday: 'long' });
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
  },

  filterList(v) { this.paintList(v.trim()); },

  async loadRequestCount() {
    try {
      const reqs = await window.api.listChatRequests();
      const el = document.getElementById('chat-req-count');
      if (el) { el.textContent = reqs.length; el.classList.toggle('hidden', !reqs.length); }
    } catch (_) {}
  },

  // ---------- Adjuntos ----------
  kindIcon(kind) { return { image: 'photo', gif: 'gif_box', video: 'videocam', audio: 'mic', file: 'description' }[kind] || 'attach_file'; },
  kindLabel(kind, name = '') { return { image: 'Foto', gif: 'GIF', video: 'Vídeo', audio: 'Audio' }[kind] || UI.plain(name) || 'Documento'; },
  fileSize(n) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; },
  fileExt(name) { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toUpperCase() : 'ARCHIVO'; },

  // Tipos que acepta el servidor (handlers/chat_handlers.go)
  accepts: {
    media: 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov',
    gif: 'image/gif,.gif',
    audio: 'audio/*,.mp3,.ogg,.opus,.wav,.m4a,.aac,.weba',
    file: '.pdf,.txt,.csv,.md,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.zip,.rar,.7z,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.mp3,.ogg,.opus,.wav,.m4a,.aac'
  },
  allowedExt: /\.(jpe?g|png|webp|gif|mp4|webm|mov|mp3|ogg|opus|wav|m4a|aac|weba|pdf|txt|csv|md|json|docx?|xlsx?|pptx?|odt|ods|zip|rar|7z)$/i,

  async openConversation(convId) {
    const conv = this.conversations.find(c => c.id === convId);
    const other = conv ? conv.other_username : 'usuario';
    this.otherName = other;
    this.editing = null;
    this.replyTo = null;
    this.features = {};
    this._sig = '';
    const section = document.querySelector('#main-view-container section.card');
    section.innerHTML = `
      <header class="flex items-center gap-3 border-b border-line px-4 py-3">
        <a href="/chat" data-link class="btn-icon md:hidden">${UI.icon('arrow_back')}</a>
        ${UI.avatar({ username: other }, 38)}
        <div class="min-w-0 flex-1">
          <a href="/u/${encodeURIComponent(other)}" data-link class="block truncate text-label-lg hover:text-secondary">@${UI.esc(other)}</a>
          <span class="flex items-center gap-1 text-body-sm text-ink-muted">${UI.icon('lock', 'text-[13px]')} Conversación privada entre dos miembros</span>
        </div>
        <a href="/u/${encodeURIComponent(other)}" data-link class="btn-icon" title="Ver perfil">${UI.icon('person')}</a>
      </header>
      <div id="chat-messages" class="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 sm:px-6"></div>
      <div id="chat-drop" class="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center rounded-lg border-2 border-dashed border-primary bg-surface-base/90 text-headline-sm text-primary">${UI.icon('upload_file', 'mr-2 text-[28px]')} Suelta aquí para enviar</div>
      <div id="chat-edit-bar" class="hidden"></div>
      <form class="relative flex items-end gap-2 border-t border-line p-3" ${UI.on('submit', 'ChatView.send', UI.EVENT)}>
        <button type="button" id="chat-attach" class="btn-icon hidden h-[42px] w-[42px] shrink-0" aria-label="Adjuntar" title="Adjuntar foto, vídeo, audio o documento" ${UI.on('click.stop', 'ChatView.toggleAttachMenu', UI.EL)}>${UI.icon('attach_file', 'text-[22px] -rotate-45')}</button>
        <textarea id="chat-input" rows="1" maxlength="2000" class="input max-h-32 resize-none" placeholder="Escribe un mensaje… (Enter para enviar, Shift + Enter salto de línea)"></textarea>
        <button id="chat-send" class="btn-primary h-[42px]" aria-label="Enviar">${UI.icon('send', 'text-[18px]')}</button>
        <input type="file" id="chat-file" class="hidden" multiple>
      </form>`;
    section.classList.add('relative');
    const input = document.getElementById('chat-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(e); }
      if (e.key === 'Escape') { if (this.editing) { e.preventDefault(); this.cancelEdit(); } else if (this.replyTo) { e.preventDefault(); this.cancelReply(); } }
    });
    input.addEventListener('input', () => this.autosize());
    // Pegar una imagen desde el portapapeles abre la vista previa
    input.addEventListener('paste', e => {
      if (!this.features.attachments) return;
      const files = [...(e.clipboardData && e.clipboardData.files || [])];
      if (files.length) { e.preventDefault(); this.previewFiles(files); }
    });
    document.getElementById('chat-file').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) this.previewFiles(files); });
    // Arrastrar y soltar archivos sobre la conversación
    const drop = document.getElementById('chat-drop');
    let depth = 0;
    section.addEventListener('dragenter', e => { if (!this.features.attachments || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); depth++; drop.classList.remove('hidden'); drop.classList.add('flex'); });
    section.addEventListener('dragover', e => { if (this.features.attachments && e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    section.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.add('hidden'); drop.classList.remove('flex'); } });
    section.addEventListener('drop', e => { if (!this.features.attachments) return; e.preventDefault(); depth = 0; drop.classList.add('hidden'); drop.classList.remove('flex'); const files = [...e.dataTransfer.files]; if (files.length) this.previewFiles(files); });
    // El menú se cierra cuando la persona desplaza (no con el desplazamiento automático al cargar imágenes)
    ['wheel', 'touchmove'].forEach(t => document.getElementById('chat-messages').addEventListener(t, () => this.closeMenu(), { passive: true }));
    await this.loadMessages(true);
    input.focus();
    // 04_30 Conversación "en tiempo real": mensajes y marcas cada 4 s, bandeja cada 12 s;
    // con la pestaña en segundo plano no se consulta (y así tampoco se marca como leído)
    let tick = 0;
    this.timer = setInterval(() => {
      if (!document.getElementById('chat-messages') || this.activeId !== convId) return this.stopPolling();
      if (document.hidden) return;
      this.loadMessages(false);
      if (++tick % 3 === 0) this.loadList();
    }, 4000);
  },

  autosize() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
  },

  dayLabel(iso) {
    const d = new Date(iso), now = new Date();
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  },

  time(iso) { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); },

  canEdit(m) { return this.features.edit_delete && m.sender_id === window.api.user.id && !m.deleted && !m.pending && Date.now() - new Date(m.created_at) < 15 * 60000; },
  canDeleteAll(m) { return this.features.edit_delete && m.sender_id === window.api.user.id && !m.deleted && Date.now() - new Date(m.created_at) < 48 * 3600000; },
  authorName(senderId) { return senderId === window.api.user.id ? 'Tú' : `@${this.otherName}`; },

  // Cita del mensaje respondido (clic → salta al original)
  quote(r, mine) {
    if (!r) return '';
    const text = r.deleted ? `<span class="italic">${UI.icon('block', 'text-[13px] align-[-2px]')} Mensaje eliminado</span>`
      : `${r.attachment_kind ? `${UI.icon(this.kindIcon(r.attachment_kind), 'text-[14px] align-[-2px]')} ` : ''}${r.text ? UI.esc(r.text) : r.attachment_kind ? UI.esc(this.kindLabel(r.attachment_kind, r.attachment_name)) : ''}`;
    const own = r.sender_id === window.api.user.id;
    return `
      <button type="button" class="mb-1 block w-full rounded-md border-l-4 ${own ? 'border-primary' : 'border-secondary'} ${mine ? 'bg-black/25' : 'bg-surface-base'} px-2.5 py-1.5 text-left text-body-sm hover:brightness-110" ${UI.on('click.stop', 'ChatView.jumpTo', r.id)}>
        <span class="block text-label-md ${own ? 'text-primary' : 'text-secondary'}">${this.authorName(r.sender_id)}</span>
        <span class="line-clamp-2 text-ink-secondary">${text}</span>
      </button>`;
  },

  // Bloque del adjunto dentro de la burbuja
  attachmentBlock(a, pending) {
    if (!a) return '';
    if (pending) {
      return `<div class="mb-1 flex items-center gap-3 rounded-md bg-black/20 p-3">${UI.icon(this.kindIcon(a.kind), 'text-[26px] text-ink-secondary')}<span class="min-w-0 flex-1"><span class="block truncate text-label-lg">${UI.esc(a.filename)}</span><span class="block text-body-sm text-ink-muted" data-progress>Subiendo… 0%</span></span></div>`;
    }
    if (a.kind === 'image' || a.kind === 'gif') {
      return `
        <button type="button" class="relative mb-1 block overflow-hidden rounded-md bg-black/30" style="min-width:180px;min-height:120px" aria-label="Ver imagen" ${UI.on('click.stop', 'ChatView.lightbox', a.id)}>
          <img data-att="${UI.esc(a.id)}" alt="${UI.esc(a.filename)}" class="block max-h-80 w-full max-w-[300px] object-cover opacity-0 transition-opacity" />
          <span data-att-loading class="absolute inset-0 flex items-center justify-center">${UI.icon('progress_activity', 'animate-spin text-ink-muted')}</span>
          ${a.kind === 'gif' ? '<span class="absolute left-2 top-2 rounded bg-black/60 px-1.5 text-[11px] font-bold text-white">GIF</span>' : ''}
        </button>`;
    }
    if (a.kind === 'video' || a.kind === 'audio') {
      return `
        <div class="mb-1" data-media-box="${UI.esc(a.id)}">
          <button type="button" class="flex w-full min-w-[230px] items-center gap-3 rounded-md bg-black/25 p-3 text-left hover:bg-black/35" ${UI.on('click.stop', 'ChatView.loadMedia', a.id, a.kind)}>
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink">${UI.icon('play_arrow', 'icon-fill')}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-lg">${a.kind === 'video' ? 'Vídeo' : 'Audio'}</span><span class="block truncate text-body-sm text-ink-muted">${UI.esc(a.filename)} · ${this.fileSize(a.size)}</span></span>
          </button>
        </div>`;
    }
    return `
      <button type="button" class="mb-1 flex w-full min-w-[230px] items-center gap-3 rounded-md bg-black/25 p-3 text-left hover:bg-black/35" title="Descargar" ${UI.on('click.stop', 'ChatView.download', a.id)}>
        <span class="flex h-11 w-9 shrink-0 items-center justify-center rounded bg-surface-subtle font-mono text-[10px] font-bold text-ink-secondary">${UI.esc(this.fileExt(a.filename))}</span>
        <span class="min-w-0 flex-1"><span class="block truncate text-label-lg">${UI.esc(a.filename)}</span><span class="block text-body-sm text-ink-muted">${this.fileSize(a.size)} · ${UI.esc(this.fileExt(a.filename))}</span></span>
        ${UI.icon('download', 'text-ink-secondary')}
      </button>`;
  },

  bubble(m) {
    const mine = m.sender_id === window.api.user.id;
    const meta = `
      <span class="ml-3 inline-flex translate-y-1 items-center gap-1 whitespace-nowrap align-bottom text-[11px] text-ink-muted float-right">
        ${m.edited_at && !m.deleted ? '<span class="italic">Editado</span>' : ''}
        <span>${this.time(m.created_at)}</span>
        ${mine && !m.deleted ? this.ticks(m.status) : ''}
      </span>`;
    const text = m.message_text ? `<span class="whitespace-pre-wrap break-words">${UI.esc(m.message_text)}</span>` : '';
    const body = m.deleted
      ? `<span class="flex items-center gap-1.5 italic text-ink-muted">${UI.icon('block', 'text-[16px]')}${mine ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}</span>`
      : `${this.quote(m.reply_to, mine)}${this.attachmentBlock(m.attachment, m.pending)}${text}`;
    const menuBtn = m.pending || m.noMenu ? '' : `
      <button type="button" class="absolute right-1 top-1 z-[1] flex h-6 w-6 items-center justify-center rounded-full ${mine ? 'bg-[#123b2c]' : 'bg-surface-elevated'} text-ink-secondary opacity-100 shadow-sm transition-opacity hover:text-ink focus:opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label="Opciones del mensaje" ${UI.on('click.stop', 'ChatView.openMenu', UI.EL, m.id)}>${UI.icon('expand_more', 'text-[18px]')}</button>`;
    return `
      <div class="flex ${mine ? 'justify-end' : 'justify-start'} rounded-lg transition-colors" data-msg="${UI.esc(m.id)}">
        <div class="group relative max-w-[78%] rounded-lg px-2 pb-1.5 pt-1.5 ${m.attachment ? 'pr-2' : 'pl-3 pr-8'} text-body-md shadow-sm ${mine
          ? 'rounded-tr-sm border border-primary/25 bg-[#123b2c] text-ink'
          : 'rounded-tl-sm border border-line bg-surface-elevated text-ink'} ${m.deleted ? 'opacity-80' : ''}">
          ${body}${meta}
          ${menuBtn}
        </div>
      </div>`;
  },

  async loadMessages(scroll) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    try {
      const { messages: msgs, features } = await window.api.listMessagesFull(this.activeId);
      this.features = features || {};
      const attach = document.getElementById('chat-attach');
      if (attach) attach.classList.toggle('hidden', !this.features.attachments);
      const sig = msgs.map(m => `${m.id}:${m.status || ''}:${m.edited_at || ''}:${m.deleted ? 1 : 0}`).join();
      if (sig === this._sig && !scroll) return;
      if (this._menuFor && !scroll) return; // no repintar con un menú abierto; se actualizará en el siguiente ciclo
      if (box.querySelector('[data-uploading]') && !scroll) return; // hay una subida en curso
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      this._sig = sig;
      this.messages = new Map(msgs.map(m => [m.id, m]));
      let lastDay = '';
      box.innerHTML = msgs.length ? msgs.map(m => {
        const day = this.dayLabel(m.created_at);
        const sep = day !== lastDay ? `<div class="sticky top-0 z-10 my-2 flex justify-center"><span class="rounded-md border border-line bg-surface-card/95 px-3 py-1 text-label-sm uppercase tracking-wider text-ink-muted shadow-sm">${day}</span></div>` : '';
        lastDay = day;
        return sep + this.bubble(m);
      }).join('') : `<div class="m-auto max-w-xs rounded-md border border-line bg-surface-elevated px-4 py-3 text-center text-body-sm text-ink-muted">${UI.icon('lock', 'text-[15px] align-[-3px]')} Los mensajes son privados entre tú y @${UI.esc(this.otherName || '')}. ¡Saluda!</div>`;
      if (scroll || atBottom) box.scrollTop = box.scrollHeight;
      this.hydrate(scroll || atBottom);
    } catch (err) {
      if (scroll) box.innerHTML = UI.error(err, () => ChatView.loadMessages(true));
    }
  },

  // Carga las imágenes (con autenticación) y mantiene el scroll abajo cuando crecen
  hydrate(stickBottom) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.querySelectorAll('img[data-att]').forEach(async img => {
      try {
        img.src = await window.api.attachmentURL(img.dataset.att);
        img.onload = () => {
          img.classList.remove('opacity-0');
          const sp = img.parentElement.querySelector('[data-att-loading]');
          if (sp) sp.remove();
          if (stickBottom) box.scrollTop = box.scrollHeight;
        };
      } catch (err) {
        const sp = img.parentElement.querySelector('[data-att-loading]');
        if (sp) sp.innerHTML = `<span class="px-3 text-center text-body-sm text-ink-muted">${UI.icon('broken_image')}<br>${UI.esc(err.message || 'No disponible')}</span>`;
      }
    });
  },

  async loadMedia(id, kind) {
    const box = document.querySelector(`[data-media-box="${CSS.escape(id)}"]`);
    if (!box) return;
    box.innerHTML = `<div class="flex items-center gap-2 p-3 text-body-sm text-ink-muted">${UI.icon('progress_activity', 'animate-spin')} Cargando…</div>`;
    try {
      const url = await window.api.attachmentURL(id);
      box.innerHTML = kind === 'video'
        ? `<video src="${url}" controls autoplay playsinline class="block max-h-80 w-full max-w-[320px] rounded-md bg-black"></video>`
        : `<audio src="${url}" controls autoplay class="w-[260px] max-w-full"></audio>`;
    } catch (err) {
      box.innerHTML = `<div class="p-3 text-body-sm text-danger">${UI.esc(err.message || 'No se pudo cargar')}</div>`;
    }
  },

  async download(id) {
    this.closeMenu();
    const m = [...(this.messages || new Map()).values()].find(x => x.attachment && x.attachment.id === id);
    try {
      const url = await window.api.attachmentURL(id);
      const a = Object.assign(document.createElement('a'), { href: url, download: m ? UI.plain(m.attachment.filename) : 'archivo' });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo descargar');
    }
  },

  // Visor de imágenes a pantalla completa
  async lightbox(id) {
    const m = [...this.messages.values()].find(x => x.attachment && x.attachment.id === id);
    const a = m && m.attachment;
    const el = document.createElement('div');
    el.id = 'chat-lightbox';
    el.className = 'fixed inset-0 z-[120] flex flex-col bg-black/95';
    el.innerHTML = `
      <div class="flex items-center gap-3 px-4 py-3 text-white">
        ${UI.avatar({ username: m && m.sender_id === window.api.user.id ? window.api.user.username : this.otherName }, 34)}
        <div class="min-w-0 flex-1"><div class="truncate text-label-lg">${m ? UI.esc(this.authorName(m.sender_id)) : ''}</div><div class="text-body-sm text-white/60">${m ? `${this.dayLabel(m.created_at)} · ${this.time(m.created_at)}` : ''}</div></div>
        <button class="btn-icon text-white hover:bg-white/10" title="Descargar" ${UI.on('click', 'ChatView.download', id)}>${UI.icon('download')}</button>
        <button class="btn-icon text-white hover:bg-white/10" title="Cerrar" ${UI.on('click', 'ChatView.closeLightbox')}>${UI.icon('close')}</button>
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center p-4" ${UI.on('click', 'ChatView.closeLightbox')}>${UI.icon('progress_activity', 'animate-spin text-white/60')}</div>
      ${m && m.message_text ? `<div class="px-4 pb-6 text-center text-body-md text-white/90">${UI.esc(m.message_text)}</div>` : ''}`;
    document.body.appendChild(el);
    this._lbKey = e => { if (e.key === 'Escape') this.closeLightbox(); };
    document.addEventListener('keydown', this._lbKey);
    try {
      const url = await window.api.attachmentURL(id);
      const stage = el.children[1];
      if (stage) stage.innerHTML = `<img src="${url}" alt="${a ? UI.esc(a.filename) : ''}" class="max-h-full max-w-full rounded object-contain" ${UI.on('click.stop', 'ChatView.noop')}>`;
    } catch (err) {
      if (el.children[1]) el.children[1].innerHTML = `<span class="text-white/70">${UI.esc(err.message || 'No disponible')}</span>`;
    }
  },

  closeLightbox() {
    const el = document.getElementById('chat-lightbox');
    if (el) el.remove();
    if (this._lbKey) document.removeEventListener('keydown', this._lbKey);
  },

  noop() {},

  // ---------- Menú de adjuntar ----------
  toggleAttachMenu(btn) {
    const old = document.getElementById('chat-attach-menu');
    if (old) { old.remove(); return; }
    const item = (kind, icon, color, label) => `<button type="button" role="menuitem" class="nav-item w-full" ${UI.on('click', 'ChatView.pickFiles', kind)}><span class="flex h-8 w-8 items-center justify-center rounded-full ${color}">${UI.icon(icon, 'text-[18px]')}</span>${label}</button>`;
    const menu = document.createElement('div');
    menu.id = 'chat-attach-menu';
    menu.setAttribute('role', 'menu');
    menu.className = 'panel fixed z-[90] w-56 p-1.5';
    menu.innerHTML = item('media', 'photo_library', 'bg-secondary/15 text-secondary', 'Fotos y vídeos')
      + item('gif', 'gif_box', 'bg-tertiary/15 text-tertiary-soft', 'GIF')
      + item('audio', 'headphones', 'bg-warning/15 text-warning', 'Audio')
      + item('file', 'description', 'bg-primary/15 text-primary', 'Documento');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.left = `${Math.max(8, r.left)}px`;
    menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 6)}px`;
    const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  pickFiles(kind) {
    const menu = document.getElementById('chat-attach-menu');
    if (menu) menu.remove();
    const input = document.getElementById('chat-file');
    input.accept = this.accepts[kind] || this.accepts.file;
    input.click();
  },

  // Vista previa antes de enviar (como WhatsApp): miniaturas, texto opcional y Enviar
  previewFiles(files) {
    const max = (this.features.max_file_mb || 15) * 1048576;
    const bad = files.filter(f => !this.allowedExt.test(f.name || '') && !(f.type && /^image\/(png|jpeg|webp|gif)$/.test(f.type)));
    const big = files.filter(f => f.size > max);
    files = files.filter(f => !bad.includes(f) && !big.includes(f)).slice(0, 10);
    if (bad.length) window.utils.showToast(`Tipo no permitido: ${bad.map(f => f.name).join(', ')}`, 'warning');
    if (big.length) window.utils.showToast(`Supera ${this.features.max_file_mb || 15} MB: ${big.map(f => f.name).join(', ')}`, 'warning');
    if (!files.length) return;
    // Imágenes pegadas sin nombre: se les da uno
    files = files.map(f => f.name && f.name !== 'image.png' ? f : new File([f], `foto-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
    this._pending = files;
    this._previewURLs = files.map(f => URL.createObjectURL(f));
    const thumb = (f, i) => /^image\//.test(f.type)
      ? `<img src="${this._previewURLs[i]}" alt="" class="h-full w-full object-cover">`
      : /^video\//.test(f.type)
        ? `<video src="${this._previewURLs[i]}" muted class="h-full w-full object-cover"></video>`
        : `<span class="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">${UI.icon(/^audio\//.test(f.type) ? 'headphones' : 'description', 'text-[28px] text-ink-secondary')}<span class="font-mono text-[10px] text-ink-muted">${UI.esc(this.fileExt(f.name))}</span></span>`;
    UI.modal({
      title: files.length === 1 ? 'Enviar archivo' : `Enviar ${files.length} archivos`, icon: 'attach_file', tone: 'primary', size: 'max-w-xl',
      body: `
        ${this.replyTo ? `<div class="mb-3 rounded-md border-l-4 border-secondary bg-surface-base px-3 py-2 text-body-sm"><span class="text-label-md text-secondary">Respondiendo a ${this.authorName(this.replyTo.sender_id)}</span><span class="block truncate">${UI.esc(this.replyTo.preview)}</span></div>` : ''}
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          ${files.map((f, i) => `
            <figure class="overflow-hidden rounded-md border border-line bg-surface-base">
              <div class="aspect-square">${thumb(f, i)}</div>
              <figcaption class="truncate px-2 py-1 text-body-sm text-ink-secondary" title="${UI.esc(f.name)}">${UI.esc(f.name)} · ${this.fileSize(f.size)}</figcaption>
            </figure>`).join('')}
        </div>
        <textarea id="chat-caption" class="input mt-3" rows="2" maxlength="2000" placeholder="${files.length === 1 ? 'Añade un comentario (opcional)' : 'Comentario para el primer archivo (opcional)'}"></textarea>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'ChatView.cancelPreview')}>Cancelar</button><button class="btn-primary" id="chat-send-files" ${UI.on('click', 'ChatView.sendFiles')}>${UI.icon('send', 'text-[18px]')} Enviar</button>`
    });
    const cap = document.getElementById('chat-caption');
    cap.value = document.getElementById('chat-input').value.trim();
    cap.focus();
    cap.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendFiles(); } });
  },

  cancelPreview() {
    (this._previewURLs || []).forEach(u => URL.revokeObjectURL(u));
    this._pending = null;
    UI.closeModal();
  },

  async sendFiles() {
    const files = this._pending || [];
    if (!files.length) return;
    const caption = (document.getElementById('chat-caption') || {}).value || '';
    (this._previewURLs || []).forEach(u => URL.revokeObjectURL(u));
    this._pending = null;
    UI.closeModal();
    const input = document.getElementById('chat-input');
    if (input && caption.trim() && input.value.trim() === caption.trim()) { input.value = ''; this.autosize(); }
    const replyTo = this.replyTo && this.replyTo.id;
    this.cancelReply();
    const box = document.getElementById('chat-messages');
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const kind = f.type === 'image/gif' ? 'gif' : /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : /^audio\//.test(f.type) ? 'audio' : 'file';
      const temp = { id: `tmp-${Date.now()}-${i}`, sender_id: window.api.user.id, message_text: i === 0 ? window.utils.escapeHTML(caption.trim()) : '', created_at: new Date().toISOString(), status: 'pending', pending: true, attachment: { kind, filename: f.name, size: f.size } };
      if (box) {
        if (!box.querySelector('[data-msg]')) box.innerHTML = '';
        box.insertAdjacentHTML('beforeend', this.bubble(temp).replace('data-msg=', 'data-uploading data-msg='));
        box.scrollTop = box.scrollHeight;
      }
      const el = box && box.querySelector(`[data-msg="${temp.id}"]`);
      try {
        await window.api.uploadAttachment(this.activeId, f, {
          caption: i === 0 ? caption.trim() : '',
          replyTo: i === 0 ? replyTo : '',
          onProgress: p => { const t = el && el.querySelector('[data-progress]'); if (t) t.textContent = `Subiendo… ${Math.round(p * 100)}%`; }
        });
      } catch (err) {
        if (el) el.remove();
        StatusView.toastError(err, `No se pudo enviar ${f.name}`);
      }
    }
    await this.loadMessages(true);
    this.loadList();
  },

  // ---------- Responder ----------
  startReply(id) {
    this.closeMenu();
    const m = this.messages.get(id);
    if (!m || m.deleted) return;
    if (this.editing) this.cancelEdit();
    const preview = UI.plain(m.message_text) || (m.attachment ? this.kindLabel(m.attachment.kind, m.attachment.filename) : '');
    this.replyTo = { id, sender_id: m.sender_id, preview };
    const own = m.sender_id === window.api.user.id;
    const bar = document.getElementById('chat-edit-bar');
    bar.className = 'flex items-center gap-3 border-t border-line bg-surface-elevated px-4 py-2';
    bar.innerHTML = `
      ${UI.icon('reply', own ? 'text-primary' : 'text-secondary')}
      <div class="min-w-0 flex-1 border-l-2 ${own ? 'border-primary' : 'border-secondary'} pl-3">
        <div class="text-label-md ${own ? 'text-primary' : 'text-secondary'}">Respondiendo a ${this.authorName(m.sender_id)}</div>
        <div class="flex items-center gap-1 truncate text-body-sm text-ink-secondary">${m.attachment ? UI.icon(this.kindIcon(m.attachment.kind), 'text-[15px]') : ''}<span class="truncate">${UI.esc(preview)}</span></div>
      </div>
      <button type="button" class="btn-icon" aria-label="Cancelar respuesta" ${UI.on('click', 'ChatView.cancelReply')}>${UI.icon('close')}</button>`;
    document.getElementById('chat-input').focus();
  },

  cancelReply() {
    if (!this.replyTo) return;
    this.replyTo = null;
    const bar = document.getElementById('chat-edit-bar');
    if (bar && !this.editing) { bar.className = 'hidden'; bar.innerHTML = ''; }
  },

  // Salta al mensaje citado y lo resalta un momento
  jumpTo(id) {
    const el = document.querySelector(`#chat-messages [data-msg="${CSS.escape(id)}"]`);
    if (!el) return window.utils.showToast('El mensaje original ya no está en tu chat', 'info');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-primary/10');
    setTimeout(() => el.classList.remove('bg-primary/10'), 1400);
  },

  // ---------- Menú de cada mensaje (posición fija para no quedar recortado por el scroll) ----------
  openMenu(btn, id) {
    const m = this.messages && this.messages.get(id);
    if (!m) return;
    if (this._menuFor === id) return this.closeMenu();
    this.closeMenu();
    const mine = m.sender_id === window.api.user.id;
    const item = (icon, label, action, arg = id, cls = '') => `<button role="menuitem" class="nav-item w-full ${cls}" ${UI.on('click', action, arg)}>${UI.icon(icon, 'text-[19px]')}${label}</button>`;
    const items = [];
    if (!m.deleted && this.features.replies) items.push(item('reply', 'Responder', 'ChatView.startReply'));
    if (!m.deleted && m.message_text) items.push(item('content_copy', 'Copiar', 'ChatView.copyMessage'));
    if (!m.deleted && m.attachment) items.push(item('download', 'Descargar', 'ChatView.download', m.attachment.id));
    if (this.canEdit(m)) items.push(item('edit', 'Editar', 'ChatView.startEdit'));
    if (mine && !m.deleted && this.features.receipts) items.push(item('info', 'Info. del mensaje', 'ChatView.info'));
    if (this.features.edit_delete) items.push(item('delete', 'Eliminar', 'ChatView.confirmDelete', id, 'text-danger hover:text-danger'));
    if (!items.length) return;
    const menu = document.createElement('div');
    menu.id = 'chat-msg-menu';
    menu.setAttribute('role', 'menu');
    menu.className = 'panel fixed z-[90] w-52 p-1.5';
    menu.innerHTML = items.join('');
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const h = menu.offsetHeight, w = menu.offsetWidth;
    const top = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, mine ? r.right - w : r.left));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    this._menuFor = id;
    this._closer = e => { if (!menu.contains(e.target)) this.closeMenu(); };
    this._esc = e => { if (e.key === 'Escape') this.closeMenu(); };
    setTimeout(() => { document.addEventListener('click', this._closer); document.addEventListener('keydown', this._esc); }, 0);
  },

  closeMenu() {
    const menu = document.getElementById('chat-msg-menu');
    if (menu) menu.remove();
    this._menuFor = null;
    if (this._closer) document.removeEventListener('click', this._closer);
    if (this._esc) document.removeEventListener('keydown', this._esc);
    this._closer = this._esc = null;
  },

  copyMessage(id) {
    this.closeMenu();
    const m = this.messages.get(id);
    if (m) UI.copy(UI.plain(m.message_text), 'Mensaje copiado');
  },

  // Info. del mensaje: enviado, entregado y leído
  info(id) {
    this.closeMenu();
    const m = this.messages.get(id);
    if (!m) return;
    const when = iso => iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const row = (status, label, iso) => `
      <div class="flex items-center gap-3 rounded border border-line bg-surface-base px-3 py-2.5">
        ${this.ticks(status, 'text-[20px]')}
        <span class="flex-1 text-label-lg text-ink">${label}</span>
        <span class="font-mono text-body-sm ${iso ? 'text-ink-secondary' : 'text-ink-muted'}">${when(iso)}</span>
      </div>`;
    UI.modal({
      title: 'Info. del mensaje', icon: 'info', tone: 'secondary',
      body: `
        <div class="mb-4 flex justify-end">${this.bubble({ ...m, attachment: m.attachment && (m.attachment.kind === 'image' || m.attachment.kind === 'gif') ? { ...m.attachment, kind: 'file' } : m.attachment, noMenu: true })}</div>
        <div class="flex flex-col gap-2">
          ${row('read', 'Leído', m.read_at)}
          ${row('delivered', 'Entregado', m.delivered_at)}
          ${row('sent', 'Enviado', m.created_at)}
          ${m.edited_at ? `<div class="flex items-center gap-3 rounded border border-line bg-surface-base px-3 py-2.5">${UI.icon('edit', 'text-[20px] text-ink-muted')}<span class="flex-1 text-label-lg text-ink">Editado</span><span class="font-mono text-body-sm text-ink-secondary">${when(m.edited_at)}</span></div>` : ''}
        </div>`
    });
  },

  // ---------- Editar (barra encima del cuadro de texto, como WhatsApp) ----------
  startEdit(id) {
    this.closeMenu();
    const m = this.messages.get(id);
    if (!m || !this.canEdit(m)) return window.utils.showToast('Solo puedes editar un mensaje durante los primeros 15 minutos', 'warning');
    this.replyTo = null;
    this.editing = { id, original: UI.plain(m.message_text) };
    const bar = document.getElementById('chat-edit-bar');
    bar.className = 'flex items-center gap-3 border-t border-line bg-surface-elevated px-4 py-2';
    bar.innerHTML = `
      ${UI.icon('edit', 'text-primary')}
      <div class="min-w-0 flex-1 border-l-2 border-primary pl-3">
        <div class="text-label-md text-primary">Editar mensaje</div>
        <div class="truncate text-body-sm text-ink-secondary">${UI.esc(m.message_text) || (m.attachment ? UI.esc(this.kindLabel(m.attachment.kind, m.attachment.filename)) : '')}</div>
      </div>
      <button type="button" class="btn-icon" aria-label="Cancelar edición" ${UI.on('click', 'ChatView.cancelEdit')}>${UI.icon('close')}</button>`;
    const input = document.getElementById('chat-input');
    input.value = this.editing.original;
    this.autosize();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    document.getElementById('chat-send').innerHTML = UI.icon('check', 'text-[20px]');
    document.getElementById('chat-send').setAttribute('aria-label', 'Guardar edición');
  },

  cancelEdit() {
    this.editing = null;
    const bar = document.getElementById('chat-edit-bar');
    if (bar) { bar.className = 'hidden'; bar.innerHTML = ''; }
    const input = document.getElementById('chat-input');
    if (input) { input.value = ''; this.autosize(); }
    const btn = document.getElementById('chat-send');
    if (btn) { btn.innerHTML = UI.icon('send', 'text-[18px]'); btn.setAttribute('aria-label', 'Enviar'); }
  },

  // ---------- Eliminar: para mí / para todos ----------
  confirmDelete(id) {
    this.closeMenu();
    const m = this.messages.get(id);
    if (!m) return;
    const forAll = this.canDeleteAll(m);
    UI.modal({
      title: '¿Eliminar mensaje?', icon: 'delete', tone: 'danger',
      body: forAll
        ? 'Puedes eliminarlo solo de tu chat o para todos. Si lo eliminas para todos, @' + UI.esc(this.otherName) + ' verá «Se eliminó este mensaje».'
        : (m.sender_id === window.api.user.id && !m.deleted
          ? 'Ya pasaron más de 48 horas: solo puedes eliminarlo de tu chat.'
          : 'El mensaje desaparecerá solo de tu chat; la otra persona lo seguirá viendo.'),
      actions: `
        <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          ${forAll ? `<button class="btn-danger" ${UI.on('click', 'ChatView.deleteMessage', id, 'all')}>${UI.icon('delete_forever', 'text-[18px]')} Eliminar para todos</button>` : ''}
          <button class="${forAll ? 'btn-secondary' : 'btn-danger'}" ${UI.on('click', 'ChatView.deleteMessage', id, 'me')}>${UI.icon('person_remove', 'text-[18px]')} Eliminar para mí</button>
          <button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button>
        </div>`
    });
  },

  async deleteMessage(id, scope) {
    UI.closeModal();
    try {
      await window.api.deleteMessage(id, scope);
      if (this.editing && this.editing.id === id) this.cancelEdit();
      if (this.replyTo && this.replyTo.id === id) this.cancelReply();
      window.utils.showToast(scope === 'all' ? 'Mensaje eliminado para todos' : 'Mensaje eliminado para ti', 'info');
      await this.loadMessages(false);
      this.loadList();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo eliminar el mensaje');
    }
  },

  async send(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // Guardar una edición
    if (this.editing) {
      const { id, original } = this.editing;
      if (text === original.trim()) return this.cancelEdit();
      try {
        await window.api.editMessage(id, text);
        this.cancelEdit();
        await this.loadMessages(false);
        this.loadList();
      } catch (err) {
        StatusView.toastError(err, 'No se pudo editar el mensaje');
      }
      return;
    }

    const replyTo = this.replyTo;
    input.value = '';
    this.autosize();
    this.cancelReply();
    // Envío optimista: la burbuja aparece al instante con el reloj y luego pasa a ✓
    const box = document.getElementById('chat-messages');
    const temp = {
      id: `tmp-${Date.now()}`, sender_id: window.api.user.id, message_text: window.utils.escapeHTML(text), created_at: new Date().toISOString(), status: 'pending', pending: true,
      reply_to: replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, text: replyTo.preview } : null
    };
    if (box) {
      if (!box.querySelector('[data-msg]')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', this.bubble(temp));
      box.scrollTop = box.scrollHeight;
    }
    try {
      await window.api.sendMessage(this.activeId, text, replyTo ? replyTo.id : '');
      await this.loadMessages(true);
      this.loadList();
    } catch (err) {
      const el = box && box.querySelector(`[data-msg="${temp.id}"]`);
      if (el) el.remove();
      input.value = text;
      StatusView.toastError(err, 'No se pudo enviar el mensaje');
    }
  },

  // 04_28 Bandeja de solicitudes de chat
  async requests() {
    this.stopPolling();
    this.activeId = null;
    $main().innerHTML = this.layout(`
      <header class="flex items-center gap-3 border-b border-line px-4 py-3">
        <a href="/chat" data-link class="btn-icon md:hidden">${UI.icon('arrow_back')}</a>
        <div><h2 class="text-headline-md">Solicitudes de chat</h2><p class="text-body-sm text-ink-secondary">Nadie puede escribirte sin que aceptes primero su presentación.</p></div>
      </header>
      <div id="requests-list" class="min-h-0 flex-1 overflow-y-auto p-4">${UI.skeletonPosts(2)}</div>`);
    this.loadList();
    this.loadRequestCount();
    const box = document.getElementById('requests-list');
    try {
      const reqs = await window.api.listChatRequests();
      box.innerHTML = reqs.length ? reqs.map(r => `
        <div class="card mb-3">
          <div class="flex items-center gap-3">
            ${UI.avatar({ username: r.sender_username }, 42)}
            <div class="min-w-0 flex-1"><a href="/u/${encodeURIComponent(r.sender_username || '')}" data-link class="text-label-lg hover:text-secondary">@${UI.esc(r.sender_username || 'usuario')}</a><div class="text-body-sm text-ink-muted">${window.utils.formatTime(r.created_at)}</div></div>
          </div>
          <blockquote class="mt-3 border-l-2 border-secondary/50 pl-3 text-body-md text-ink-secondary">${UI.esc(r.initial_message || '')}</blockquote>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <button class="btn-danger-ghost btn-sm" ${UI.on('click', 'ChatView.respond', r.id, 'BLOCK', r.sender_username)}>${UI.icon('block', 'text-[16px]')} Bloquear</button>
            <button class="btn-secondary btn-sm" ${UI.on('click', 'ChatView.respond', r.id, 'REJECT')}>Rechazar</button>
            <button class="btn-primary btn-sm" ${UI.on('click', 'ChatView.respond', r.id, 'ACCEPT', r.sender_username)}>${UI.icon('check', 'text-[16px]')} Aceptar</button>
          </div>
        </div>`).join('') : UI.empty({ icon: 'mark_email_read', title: 'No tienes solicitudes pendientes', text: 'Cuando alguien quiera hablar contigo, su presentación aparecerá aquí.' });
    } catch (err) {
      box.innerHTML = UI.error(err, () => ChatView.requests());
    }
  },

  async respond(id, action, username = '') {
    if (action === 'BLOCK') {
      const ok = await UI.confirm({ title: `¿Bloquear a @${username}?`, text: 'No podrá volver a enviarte solicitudes de chat.', confirmText: 'Bloquear', danger: true, icon: 'block' });
      if (!ok) return;
    }
    try {
      const res = await window.api.respondChatRequest(id, action);
      Router.refreshBadges();
      if (action === 'ACCEPT' && res && res.conversation_id) {
        window.utils.showToast(`Ahora puedes chatear con @${username}`, 'info');
        return Router.navigate(`/chat/${res.conversation_id}`);
      }
      window.utils.showToast(action === 'REJECT' ? 'Solicitud rechazada' : 'Usuario bloqueado', 'info');
      this.requests();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo responder');
    }
  },

  // 04_27 Nueva solicitud de chat y regla de presentación
  compose(query = {}) {
    this.stopPolling();
    this.activeId = null;
    $main().innerHTML = this.layout(`
      <header class="flex items-center gap-3 border-b border-line px-4 py-3">
        <a href="/chat" data-link class="btn-icon md:hidden">${UI.icon('arrow_back')}</a>
        <h2 class="text-headline-md">Nueva solicitud de chat</h2>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <div class="mb-5 flex items-start gap-3 rounded border border-secondary/30 bg-secondary/5 p-4 text-body-sm">
          ${UI.icon('gavel', 'text-secondary')}
          <div><div class="text-label-lg text-ink">Regla de presentación</div>
          <p class="mt-1 text-ink-secondary">Para evitar spam, los mensajes privados empiezan con una presentación. La otra persona decide si acepta; hasta entonces no puedes escribirle más.</p></div>
        </div>
        ${UI.field('chat-to', 'Para', { placeholder: 'nombre_de_usuario', value: query.to || '', attrs: 'autocomplete="off"' })}
        <div class="mb-1.5 flex justify-between"><label class="label mb-0" for="chat-intro">Mensaje de presentación</label><span id="chat-intro-count" class="font-mono text-body-sm text-ink-muted">0 / 500</span></div>
        <textarea id="chat-intro" class="input" rows="5" maxlength="500" placeholder="Hola, vi tu publicación sobre… y quería preguntarte…" ${UI.on('input', 'UI.count', UI.EL, 'chat-intro-count', 500)}></textarea>
        <div class="field-hint" id="chat-intro-hint"></div>
        <p class="help">Di quién eres y por qué escribes. Mínimo 10 caracteres.</p>
        <div class="mt-6 flex justify-end gap-2">
          <a href="/chat" data-link class="btn-ghost">Cancelar</a>
          <button class="btn-primary px-5" ${UI.on('click', 'ChatView.sendRequest', UI.EL)}>${UI.icon('send', 'text-[18px]')} Enviar solicitud</button>
        </div>
      </div>`);
    this.loadList();
    this.loadRequestCount();
    document.getElementById(query.to ? 'chat-intro' : 'chat-to').focus();
  },

  async sendRequest(btn) {
    const to = document.getElementById('chat-to').value.trim().replace(/^@|^u\//, '');
    const msg = document.getElementById('chat-intro').value.trim();
    const okTo = UI.setHint('chat-to', !to ? 'Escribe el nombre de usuario.' : to === window.api.user.username ? 'No puedes enviarte una solicitud a ti mismo.' : '');
    const okMsg = UI.setHint('chat-intro', msg.length < 10 ? `Te faltan ${10 - msg.length} caracteres para la presentación.` : '');
    if (!okTo || !okMsg) return;
    btn.disabled = true;
    try {
      await window.api.createChatRequest(to, msg);
      window.utils.showToast(`Solicitud enviada a @${to}. Te avisaremos cuando la acepte.`, 'info');
      Router.navigate('/chat');
    } catch (err) {
      btn.disabled = false;
      if (err.status === 404) return UI.setHint('chat-to', err.message);
      if (err.status === 409) return UI.setHint('chat-to', 'Ya existe una solicitud o conversación con este usuario.');
      StatusView.toastError(err, 'No se pudo enviar la solicitud');
    }
  },

  // Compatibilidad: botón "Mensaje" de otras vistas
  requestChat(username) {
    Router.navigate(`/chat/new?to=${encodeURIComponent(String(username).replace(/^u\/|^@/, ''))}`);
  }
};

// Detener la consulta periódica al salir del chat
window.addEventListener('popstate', () => { if (!location.pathname.startsWith('/chat/')) ChatView.stopPolling(); });
