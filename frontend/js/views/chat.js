/**
 * Vista: Mensajería Privada y Solicitudes de Chat (Pantalla Stitch 04-27)
 * Conectada a /api/v1/chats
 */

window.ChatView = {
  conversations: [],
  activeConvId: null,
  activeUsername: null,

  async render(container) {
    if (!window.api.user) {
      container.innerHTML = `
        <div class="state-empty card">
          <h3>Inicia Sesión</h3>
          <p>Para intercambiar mensajes privados con otros miembros de la comunidad.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/login')">Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: var(--space-md); height: calc(100vh - 140px); max-width: 1100px; margin: 0 auto;">
        <!-- Lista de Conversaciones -->
        <div class="card" style="display: flex; flex-direction: column; overflow: hidden; padding: var(--space-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px var(--space-sm); border-bottom: 1px solid var(--border-subtle);">
            <h3 style="font-size: 15px;">💬 Mensajes</h3>
            <button class="btn btn-primary" style="padding: 2px 8px; font-size: 11px;" onclick="ChatView.promptNewChat()">+ Nuevo</button>
          </div>

          <div id="chat-requests-list"></div>

          <div id="conversations-list" style="flex: 1; overflow-y: auto; padding-top: 8px;">
            <div class="skeleton-card" style="margin-bottom: 6px;">
              <div class="skeleton skeleton-text" style="width: 70%;"></div>
            </div>
          </div>
        </div>

        <!-- Ventana Activa de Mensajes -->
        <div class="card" style="display: flex; flex-direction: column; overflow: hidden; padding: 0;">
          <div id="chat-header" style="padding: 12px var(--space-md); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; font-size: 14px;">Selecciona una conversación</span>
          </div>

          <div id="chat-messages-container" style="flex: 1; overflow-y: auto; padding: var(--space-md); display: flex; flex-direction: column; gap: 8px;">
            <div class="state-empty" style="border: none; margin: auto;">
              <p>Selecciona un chat en el panel izquierdo para leer o redactar.</p>
            </div>
          </div>

          <div id="chat-input-bar" style="padding: 12px; border-top: 1px solid var(--border-subtle); display: none;">
            <form onsubmit="ChatView.sendMessage(event)" style="display: flex; gap: 8px;">
              <input type="text" id="chat-message-input" class="form-input" placeholder="Escribe un mensaje privado..." required autocomplete="off">
              <button type="submit" class="btn btn-primary">Enviar</button>
            </form>
          </div>
        </div>
      </div>
    `;

    await this.loadConversations();
  },

  // Solicitudes pendientes recibidas: hay que aceptarlas para que se abra la conversación
  async loadRequests() {
    const reqEl = document.getElementById('chat-requests-list');
    if (!reqEl) return;
    try {
      const requests = await window.api.listChatRequests();
      if (!requests.length) {
        reqEl.innerHTML = '';
        return;
      }
      reqEl.innerHTML = `
        <div style="padding: 8px var(--space-sm) 0; font-size: 11px; font-weight: 600; color: var(--text-secondary);">SOLICITUDES (${requests.length})</div>
        ${requests.map(r => `
          <div class="card" style="padding: 10px; margin: 6px 0;">
            <div style="font-weight: 600; font-size: 13px;">u/${window.utils.escapeHTML(r.sender_username || 'usuario')}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin: 4px 0 8px;">${window.utils.escapeHTML(r.initial_message || '')}</div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" style="padding: 2px 10px; font-size: 11px;" onclick="ChatView.respondRequest('${r.id}', 'ACCEPT', '${window.utils.escapeHTML(r.sender_username || '')}')">Aceptar</button>
              <button class="btn btn-secondary" style="padding: 2px 10px; font-size: 11px;" onclick="ChatView.respondRequest('${r.id}', 'REJECT')">Rechazar</button>
            </div>
          </div>
        `).join('')}
      `;
    } catch (_) {
      reqEl.innerHTML = '';
    }
  },

  async respondRequest(requestId, action, senderUsername = '') {
    try {
      const res = await window.api.respondChatRequest(requestId, action);
      window.utils.showToast(action === 'ACCEPT' ? 'Solicitud aceptada' : 'Solicitud rechazada', 'info');
      await this.loadConversations();
      if (action === 'ACCEPT' && res && res.conversation_id) {
        await this.selectConversation(res.conversation_id, senderUsername || 'usuario');
      }
    } catch (err) {
      window.utils.showToast(err.message || 'Error al responder la solicitud', 'error');
    }
  },

  async loadConversations() {
    const listEl = document.getElementById('conversations-list');
    await this.loadRequests();
    try {
      this.conversations = await window.api.listConversations();

      if (!this.conversations || this.conversations.length === 0) {
        listEl.innerHTML = `
          <div style="padding: var(--space-md); text-align: center; color: var(--text-muted); font-size: 12px;">
            No tienes chats activos. Inicia uno con el botón "+ Nuevo".
          </div>
        `;
        return;
      }

      listEl.innerHTML = this.conversations.map(c => `
        <div class="card" style="padding: 10px; margin-bottom: 6px; cursor: pointer; border-color: ${this.activeConvId === c.id ? 'var(--primary)' : 'var(--border-subtle)'}; background: ${this.activeConvId === c.id ? 'var(--surface-high)' : 'var(--surface-card)'};" onclick="ChatView.selectConversation('${c.id}', '${c.other_username || 'usuario'}')">
          <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); margin-bottom: 2px;">
            u/${window.utils.escapeHTML(c.other_username || 'usuario')}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${window.utils.escapeHTML(c.last_message || 'Conversación activa')}
          </div>
        </div>
      `).join('');

    } catch (err) {
      listEl.innerHTML = `<div style="padding: var(--space-md); color: var(--error); font-size: 12px;">Error al cargar chats</div>`;
    }
  },

  async selectConversation(convId, otherUsername) {
    this.activeConvId = convId;
    this.activeUsername = otherUsername;
    document.getElementById('chat-header').innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px; font-weight: 600;">u/${window.utils.escapeHTML(otherUsername)}</span>
        <span class="chip chip-karma" style="font-size: 10px;">Encriptado / REST</span>
      </div>
    `;
    document.getElementById('chat-input-bar').style.display = 'block';

    const msgContainer = document.getElementById('chat-messages-container');
    msgContainer.innerHTML = `<div class="skeleton skeleton-text" style="width: 50%;"></div>`;

    try {
      const messages = await window.api.listMessages(convId);
      if (!messages || messages.length === 0) {
        msgContainer.innerHTML = `<div style="margin: auto; color: var(--text-muted); font-size: 12px;">No hay mensajes previos en este canal.</div>`;
        return;
      }

      msgContainer.innerHTML = messages.map(m => {
        const isMine = window.api.user && m.sender_id === window.api.user.id;
        return `
          <div style="align-self: ${isMine ? 'flex-end' : 'flex-start'}; max-width: 75%; background: ${isMine ? 'var(--primary)' : 'var(--surface-elevated)'}; color: ${isMine ? 'var(--on-primary)' : 'var(--text-primary)'}; padding: 8px 12px; border-radius: 12px; font-size: 13px; border: 1px solid ${isMine ? 'transparent' : 'var(--border-subtle)'};">
            <div>${window.utils.escapeHTML(m.message_text || '')}</div>
            <div style="font-size: 10px; opacity: 0.7; text-align: right; margin-top: 2px;">${window.utils.formatTime(m.created_at)}</div>
          </div>
        `;
      }).join('');

      msgContainer.scrollTop = msgContainer.scrollHeight;
    } catch (err) {
      msgContainer.innerHTML = `<div class="state-error"><p>Error al sincronizar mensajes</p></div>`;
    }
  },

  async sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-message-input');
    const content = input.value.trim();
    if (!content || !this.activeConvId) return;

    input.value = '';
    try {
      await window.api.sendMessage(this.activeConvId, content);
      await this.selectConversation(this.activeConvId, this.activeUsername);
      await this.loadConversations();
    } catch (err) {
      window.utils.showToast(err.message || 'Error al enviar mensaje', 'error');
    }
  },

  promptNewChat() {
    const target = prompt('Nombre de usuario para solicitar chat (ej: kiba_dev o u/kiba_dev):');
    if (!target) return;
    this.requestChat(target.trim());
  },

  // También se usa desde el Explorador y los perfiles
  requestChat(username) {
    if (!window.api.user) {
      Router.navigate('/login');
      return;
    }
    const msg = prompt(`Mensaje de presentación para u/${username.replace(/^u\//, '').replace(/^@/, '')}:`);
    if (!msg) return;

    window.api.createChatRequest(username, msg)
      .then(() => {
        window.utils.showToast('Solicitud enviada. Cuando la acepten, el chat aparecerá en Mensajes Privados', 'info');
      })
      .catch(err => {
        window.utils.showToast(err.message || 'Error al enviar solicitud', 'error');
      });
  }
};
