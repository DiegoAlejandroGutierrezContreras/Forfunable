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
        : `<span class="flex min-w-0 items-center gap-1">${c.last_message_mine ? this.ticks(c.last_message_status) : ''}<span class="truncate">${UI.esc(c.last_message || 'Conversación iniciada')}</span></span>`;
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

  async openConversation(convId) {
    const conv = this.conversations.find(c => c.id === convId);
    const other = conv ? conv.other_username : 'usuario';
    this.otherName = other;
    this.editing = null;
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
      <div id="chat-messages" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4 sm:px-6"></div>
      <div id="chat-edit-bar" class="hidden"></div>
      <form class="flex items-end gap-2 border-t border-line p-3" ${UI.on('submit', 'ChatView.send', UI.EVENT)}>
        <textarea id="chat-input" rows="1" maxlength="2000" class="input max-h-32 resize-none" placeholder="Escribe un mensaje… (Enter para enviar, Shift + Enter salto de línea)"></textarea>
        <button id="chat-send" class="btn-primary h-[42px]" aria-label="Enviar">${UI.icon('send', 'text-[18px]')}</button>
      </form>`;
    const input = document.getElementById('chat-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(e); }
      if (e.key === 'Escape' && this.editing) { e.preventDefault(); this.cancelEdit(); }
    });
    input.addEventListener('input', () => this.autosize());
    document.getElementById('chat-messages').addEventListener('scroll', () => this.closeMenu(), { passive: true });
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

  canEdit(m) { return m.sender_id === window.api.user.id && !m.deleted && Date.now() - new Date(m.created_at) < 15 * 60000; },
  canDeleteAll(m) { return m.sender_id === window.api.user.id && !m.deleted && Date.now() - new Date(m.created_at) < 48 * 3600000; },

  bubble(m) {
    const mine = m.sender_id === window.api.user.id;
    const meta = `
      <span class="ml-3 inline-flex translate-y-1 items-center gap-1 whitespace-nowrap align-bottom text-[11px] text-ink-muted float-right">
        ${m.edited_at && !m.deleted ? '<span class="italic">Editado</span>' : ''}
        <span>${this.time(m.created_at)}</span>
        ${mine && !m.deleted ? this.ticks(m.status) : ''}
      </span>`;
    const body = m.deleted
      ? `<span class="flex items-center gap-1.5 italic text-ink-muted">${UI.icon('block', 'text-[16px]')}${mine ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}</span>`
      : `<span class="whitespace-pre-wrap break-words">${UI.esc(m.message_text)}</span>`;
    const menuBtn = m.pending ? '' : `
      <button type="button" class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full ${mine ? 'bg-[#123b2c]' : 'bg-surface-elevated'} text-ink-secondary opacity-100 shadow-sm transition-opacity hover:text-ink focus:opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label="Opciones del mensaje" ${UI.on('click.stop', 'ChatView.openMenu', UI.EL, m.id)}>${UI.icon('expand_more', 'text-[18px]')}</button>`;
    return `
      <div class="flex ${mine ? 'justify-end' : 'justify-start'}" data-msg="${UI.esc(m.id)}">
        <div class="group relative max-w-[78%] rounded-lg px-3 pb-1.5 pt-1.5 pr-8 text-body-md shadow-sm ${mine
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
      const msgs = await window.api.listMessages(this.activeId);
      const sig = msgs.map(m => `${m.id}:${m.status || ''}:${m.edited_at || ''}:${m.deleted ? 1 : 0}`).join();
      if (sig === this._sig && !scroll) return;
      if (this._menuFor && !scroll) return; // no repintar con un menú abierto; se actualizará en el siguiente ciclo
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
    } catch (err) {
      if (scroll) box.innerHTML = UI.error(err, () => ChatView.loadMessages(true));
    }
  },

  // ---------- Menú de cada mensaje (posición fija para no quedar recortado por el scroll) ----------
  openMenu(btn, id) {
    const m = this.messages && this.messages.get(id);
    if (!m) return;
    if (this._menuFor === id) return this.closeMenu();
    this.closeMenu();
    const mine = m.sender_id === window.api.user.id;
    const item = (icon, label, action, cls = '') => `<button role="menuitem" class="nav-item w-full ${cls}" ${UI.on('click', action, id)}>${UI.icon(icon, 'text-[19px]')}${label}</button>`;
    const items = [];
    if (!m.deleted) items.push(item('content_copy', 'Copiar', 'ChatView.copyMessage'));
    if (this.canEdit(m)) items.push(item('edit', 'Editar', 'ChatView.startEdit'));
    if (mine && !m.deleted) items.push(item('info', 'Info. del mensaje', 'ChatView.info'));
    items.push(item('delete', 'Eliminar', 'ChatView.confirmDelete', 'text-danger hover:text-danger'));
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
        <div class="mb-4 flex justify-end">${this.bubble({ ...m, pending: true })}</div>
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
    this.editing = { id, original: UI.plain(m.message_text) };
    const bar = document.getElementById('chat-edit-bar');
    bar.className = 'flex items-center gap-3 border-t border-line bg-surface-elevated px-4 py-2';
    bar.innerHTML = `
      ${UI.icon('edit', 'text-primary')}
      <div class="min-w-0 flex-1 border-l-2 border-primary pl-3">
        <div class="text-label-md text-primary">Editar mensaje</div>
        <div class="truncate text-body-sm text-ink-secondary">${UI.esc(m.message_text)}</div>
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

    input.value = '';
    this.autosize();
    // Envío optimista: la burbuja aparece al instante con el reloj y luego pasa a ✓
    const box = document.getElementById('chat-messages');
    const temp = { id: `tmp-${Date.now()}`, sender_id: window.api.user.id, message_text: window.utils.escapeHTML(text), created_at: new Date().toISOString(), status: 'pending', pending: true };
    if (box) {
      if (!box.querySelector('[data-msg]')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', this.bubble(temp));
      box.scrollTop = box.scrollHeight;
    }
    try {
      await window.api.sendMessage(this.activeId, text);
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
