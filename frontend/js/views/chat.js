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
      this.paintList();
    } catch (err) {
      box.innerHTML = `<p class="p-3 text-body-sm text-danger">${UI.esc(err.message || 'Error al cargar chats')}</p>`;
    }
  },

  paintList(filter = '') {
    const box = document.getElementById('conversations-list');
    if (!box) return;
    const list = this.conversations.filter(c => !filter || (c.other_username || '').toLowerCase().includes(filter.toLowerCase()));
    box.innerHTML = list.length ? list.map(c => `
      <a href="/chat/${encodeURIComponent(c.id)}" data-link class="flex items-center gap-3 rounded px-2 py-2.5 transition-colors ${c.id === this.activeId ? 'bg-surface-elevated' : 'hover:bg-surface-subtle'}">
        ${UI.avatar({ username: c.other_username }, 40)}
        <span class="min-w-0 flex-1">
          <span class="flex items-center justify-between gap-2"><span class="truncate text-label-lg ${c.id === this.activeId ? 'text-primary' : ''}">@${UI.esc(c.other_username || 'usuario')}</span><span class="shrink-0 text-body-sm text-ink-muted">${window.utils.formatTime(c.updated_at)}</span></span>
          <span class="block truncate text-body-sm text-ink-secondary">${UI.esc(c.last_message || 'Conversación iniciada')}</span>
        </span>
      </a>`).join('') : `<p class="p-3 text-center text-body-sm text-ink-muted">${filter ? 'Sin coincidencias.' : 'Aún no tienes conversaciones.'}</p>`;
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
      <div id="chat-messages" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"></div>
      <form class="flex items-end gap-2 border-t border-line p-3" ${UI.on('submit', 'ChatView.send', UI.EVENT)}>
        <textarea id="chat-input" rows="1" maxlength="2000" class="input max-h-32 resize-none" placeholder="Escribe un mensaje… (Enter para enviar, Shift + Enter salto de línea)"></textarea>
        <button class="btn-primary h-[42px]" aria-label="Enviar">${UI.icon('send', 'text-[18px]')}</button>
      </form>`;
    const input = document.getElementById('chat-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(e); }
    });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 128) + 'px'; });
    await this.loadMessages(true);
    input.focus();
    // 04_30 Conversación "en tiempo real": se consulta cada 5 s mientras esté abierta
    this.timer = setInterval(() => {
      if (!document.getElementById('chat-messages') || this.activeId !== convId) return this.stopPolling();
      this.loadMessages(false);
    }, 5000);
  },

  async loadMessages(scroll) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    try {
      const msgs = await window.api.listMessages(this.activeId);
      const sig = msgs.map(m => m.id).join();
      if (sig === this._sig && !scroll) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      this._sig = sig;
      const me = window.api.user;
      let lastDay = '';
      box.innerHTML = msgs.length ? msgs.map(m => {
        const mine = m.sender_id === me.id;
        const day = new Date(m.created_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
        const sep = day !== lastDay ? `<div class="my-2 text-center text-label-sm uppercase tracking-wider text-ink-muted">${day}</div>` : '';
        lastDay = day;
        return `${sep}
          <div class="flex ${mine ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[75%] rounded-lg px-3.5 py-2 text-body-md ${mine ? 'rounded-br-sm bg-primary text-primary-ink' : 'rounded-bl-sm border border-line bg-surface-elevated text-ink'}">
              <div class="whitespace-pre-wrap break-words">${UI.esc(m.message_text)}</div>
              <div class="mt-0.5 text-right text-[10px] ${mine ? 'text-primary-ink/70' : 'text-ink-muted'}">${new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>`;
      }).join('') : `<div class="m-auto text-body-sm text-ink-muted">No hay mensajes todavía. ¡Saluda!</div>`;
      if (scroll || atBottom) box.scrollTop = box.scrollHeight;
    } catch (err) {
      if (scroll) box.innerHTML = UI.error(err, () => ChatView.loadMessages(true));
    }
  },

  async send(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    try {
      await window.api.sendMessage(this.activeId, text);
      await this.loadMessages(true);
      this.loadList();
    } catch (err) {
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
