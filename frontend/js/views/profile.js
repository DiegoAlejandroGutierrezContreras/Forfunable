/**
 * Vista: Perfil de Usuario y Desglose de Karma (Pantalla Stitch 01-10)
 * Conectada a /api/v1/users/{id}/karma y /api/v1/users/me/profile
 */

window.ProfileView = {
  async render(container, username = null) {
    const targetUser = username || (window.api.user ? window.api.user.username : null);

    if (!targetUser) {
      container.innerHTML = `
        <div class="state-empty card">
          <h3>Inicia Sesión</h3>
          <p>Para ver tu perfil y reputación técnica acumulada.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/login')">Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div id="profile-content" style="max-width: 800px; margin: 0 auto;">
        <!-- Loading State -->
        <div class="skeleton-card">
          <div style="display: flex; gap: 16px; align-items: center;">
            <div class="skeleton skeleton-avatar" style="width: 64px; height: 64px;"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-title" style="width: 40%;"></div>
              <div class="skeleton skeleton-text" style="width: 60%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    await this.loadProfile(targetUser);
  },

  async loadProfile(username) {
    const contentEl = document.getElementById('profile-content');
    try {
      const user = await window.api.getPublicProfile(username);
      const karmaData = await window.api.getUserKarma(user.id);

      const isMe = window.api.user && window.api.user.id === user.id;

      contentEl.innerHTML = `
        <div class="card card-elevated" style="margin-bottom: var(--space-lg);">
          <div style="display: flex; gap: 20px; align-items: flex-start;">
            ${this.avatarHTML(user, 72)}

            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h1 style="margin-bottom: 4px;">u/${window.utils.escapeHTML(user.username)}</h1>
                  <div style="display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--text-secondary);">
                    <span class="chip chip-mod">${window.utils.escapeHTML(user.global_role || user.role || 'USER')}</span>
                    <span>•</span>
                    <span>${this.statusLabel(user.presence_status)}</span>
                    <span>•</span>
                    <span>Miembro desde ${window.utils.formatTime(user.created_at)}</span>
                  </div>
                </div>

                ${isMe ? `
                  <button class="btn btn-secondary" onclick="ProfileView.openEditModal()">Editar Perfil</button>
                ` : ''}
              </div>

              <p style="margin-top: 12px; font-size: 14px; color: var(--text-primary); line-height: 1.5;">
                ${window.utils.escapeHTML(user.bio || 'Ingeniero de software participando en Forfunable.')}
              </p>
            </div>
          </div>
        </div>

        <!-- Desglose de Karma y Rangos (Pantalla Stitch 01-10) -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-md); margin-bottom: var(--space-lg);">
          <div class="card" style="text-align: center; border-left: 3px solid var(--primary);">
            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Karma Total</div>
            <div class="karma-counter" style="font-size: 28px; color: var(--primary);">
              ${karmaData.total_karma || user.karma_score || 0}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Reputación Global</div>
          </div>

          <div class="card" style="text-align: center; border-left: 3px solid var(--secondary);">
            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Karma de Posts</div>
            <div class="karma-counter" style="font-size: 28px; color: var(--secondary);">
              ${karmaData.post_karma || 0}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Aporte en discusiones</div>
          </div>

          <div class="card" style="text-align: center; border-left: 3px solid var(--tertiary);">
            <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">Karma de Respuestas</div>
            <div class="karma-counter" style="font-size: 28px; color: var(--tertiary);">
              ${karmaData.comment_karma || 0}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Comentarios y respuestas</div>
          </div>
        </div>
      `;

    } catch (err) {
      contentEl.innerHTML = `
        <div class="state-error">
          <h3>Error al cargar el perfil</h3>
          <p>${window.utils.escapeHTML(err.message || 'El usuario no existe.')}</p>
        </div>
      `;
    }
  },

  statusLabel(status) {
    return { ONLINE: '🟢 En línea', BUSY: '🔴 Ocupado', OFFLINE: '⚪ Desconectado' }[status] || '⚪ Desconectado';
  },

  // Foto de perfil por enlace; si no hay (o no carga) se muestra la inicial del usuario
  avatarHTML(user, size) {
    const initial = window.utils.escapeHTML((user.username || '?').charAt(0).toUpperCase());
    const base = `width: ${size}px; height: ${size}px; border-radius: var(--radius-full); border: 2px solid var(--primary); box-shadow: 0 0 16px var(--primary-tint); flex-shrink: 0;`;
    const fallback = `<div style="${base} background: var(--surface-subtle); display: flex; align-items: center; justify-content: center; font-size: ${Math.round(size / 2.2)}px; font-weight: 700; color: var(--primary);">${initial}</div>`;
    if (!/^https?:\/\//i.test(user.avatar_url || '')) return fallback;
    return `<img src="${window.utils.escapeHTML(user.avatar_url)}" alt="" style="${base} object-fit: cover;" onerror="this.outerHTML = this.dataset.fallback" data-fallback="${window.utils.escapeHTML(fallback)}">`;
  },

  async openEditModal() {
    let me;
    try {
      me = await window.api.getMe();
    } catch (err) {
      window.utils.showToast(err.message || 'No se pudo cargar tu perfil', 'error');
      return;
    }
    this.original = me;
    const esc = window.utils.escapeHTML;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'edit-profile-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin-bottom: var(--space-md);">Editar Perfil</h3>

        <div style="display: flex; gap: 14px; align-items: center; margin-bottom: var(--space-md);">
          <div id="edit-avatar-preview">${this.avatarHTML(me, 64)}</div>
          <div class="form-group" style="flex: 1; margin: 0;">
            <label class="form-label" for="edit-avatar">Foto de perfil (enlace a una imagen)</label>
            <input type="url" id="edit-avatar" class="form-input" placeholder="https://..." value="${esc(me.avatar_url || '')}" oninput="ProfileView.validate('edit-avatar')">
            <div class="field-hint" id="edit-avatar-hint"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-username">Nombre de usuario</label>
          <input type="text" id="edit-username" class="form-input" value="${esc(me.username)}" autocomplete="username" oninput="ProfileView.validate('edit-username')">
          <div class="field-hint" id="edit-username-hint"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-email">Correo electrónico</label>
          <input type="email" id="edit-email" class="form-input" value="${esc(me.email || '')}" autocomplete="email" oninput="ProfileView.validate('edit-email')">
          <div class="field-hint" id="edit-email-hint"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-bio">Biografía <span id="edit-bio-count" style="color: var(--text-muted);"></span></label>
          <textarea id="edit-bio" class="form-textarea" rows="3" maxlength="300" placeholder="Cuéntale a la comunidad sobre ti" oninput="ProfileView.validate('edit-bio')">${esc(me.bio || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-status">Estado</label>
          <select id="edit-status" class="form-select">
            ${['ONLINE', 'BUSY', 'OFFLINE'].map(st => `<option value="${st}" ${me.presence_status === st ? 'selected' : ''}>${this.statusLabel(st)}</option>`).join('')}
          </select>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); margin: var(--space-md) 0; padding-top: var(--space-md);">
          <div style="font-weight: 600; margin-bottom: 4px;">Cambiar contraseña</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Déjalo vacío si no quieres cambiarla.</div>
          <div class="form-group">
            <label class="form-label" for="edit-current-password">Contraseña actual</label>
            <input type="password" id="edit-current-password" class="form-input" autocomplete="current-password" oninput="ProfileView.validate('edit-new-password')">
            <div class="field-hint" id="edit-current-password-hint"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-new-password">Nueva contraseña</label>
            <input type="password" id="edit-new-password" class="form-input" autocomplete="new-password" oninput="ProfileView.validate('edit-new-password')">
            <ul class="password-rules" id="edit-new-password-rules"></ul>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--space-md);">
          <button class="btn btn-ghost" onclick="document.getElementById('edit-profile-modal').remove()">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-profile" onclick="ProfileView.saveProfile()">Guardar Cambios</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.validate('edit-bio');
  },

  // Validación en vivo con las mismas reglas del registro (AuthView.validators) y del backend
  validate(id) {
    const v = AuthView.validators;
    const val = el => document.getElementById(el).value.trim();
    const setHint = (field, error) => {
      document.getElementById(`${field}-hint`).innerHTML = error ? `<span>ⓘ</span><span>${error}</span>` : '';
      document.getElementById(field).classList.toggle('is-invalid', !!error);
      return !error;
    };

    if (id === 'edit-username') return setHint(id, v.username(val(id)));
    if (id === 'edit-email') return setHint(id, v.email(val(id)));
    if (id === 'edit-bio') {
      document.getElementById('edit-bio-count').textContent = `(${document.getElementById(id).value.length}/300)`;
      return true;
    }
    if (id === 'edit-avatar') {
      const url = val(id);
      const ok = !url || /^https?:\/\/[^\s]+\.[^\s]+/i.test(url);
      document.getElementById('edit-avatar-preview').innerHTML = this.avatarHTML({ username: val('edit-username'), avatar_url: ok ? url : '' }, 64);
      return setHint(id, ok ? '' : 'El enlace debe empezar por https:// (ej: https://sitio.com/foto.jpg).');
    }
    if (id === 'edit-new-password') {
      const current = document.getElementById('edit-current-password').value;
      const next = document.getElementById('edit-new-password').value;
      const rulesEl = document.getElementById('edit-new-password-rules');
      if (!current && !next) {
        rulesEl.innerHTML = '';
        setHint('edit-current-password', '');
        return true;
      }
      const rules = v.passwordRules(next);
      rulesEl.innerHTML = rules.map(r => `<li class="${r.ok ? 'ok' : 'missing'}">${r.ok ? '✓' : '✗'} ${r.text}</li>`).join('');
      const currentOk = setHint('edit-current-password', current ? '' : 'Escribe tu contraseña actual para cambiarla.');
      return currentOk && rules.every(r => r.ok);
    }
    return true;
  },

  async saveProfile() {
    const fields = ['edit-avatar', 'edit-username', 'edit-email', 'edit-new-password'];
    const invalid = fields.find(id => !this.validate(id));
    if (invalid) {
      document.getElementById(invalid === 'edit-new-password' ? 'edit-current-password' : invalid).focus();
      return;
    }

    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const get = id => document.getElementById(id).value.trim();
    const username = get('edit-username');
    const status = document.getElementById('edit-status').value;
    const currentPassword = document.getElementById('edit-current-password').value;
    const newPassword = document.getElementById('edit-new-password').value;

    try {
      await window.api.updateProfile({
        username,
        email: get('edit-email'),
        avatar_url: get('edit-avatar'),
        bio: get('edit-bio')
      });
      if (status !== this.original.presence_status) await window.api.updateStatus(status);
      if (newPassword) await window.api.changePassword(currentPassword, newPassword);
      // El token lleva el nombre de usuario: se renueva para que el resto de la app use el nuevo
      if (username !== this.original.username) await window.api.refreshToken();
      await window.api.getMe();

      document.getElementById('edit-profile-modal').remove();
      window.utils.showToast(newPassword ? 'Perfil y contraseña actualizados' : 'Perfil actualizado con éxito', 'info');
      Router.navigate(`/u/${encodeURIComponent(window.api.user.username)}`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Guardar Cambios';
      window.utils.showToast(err.message || 'Error al actualizar', 'error');
    }
  }
};
