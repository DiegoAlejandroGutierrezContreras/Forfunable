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
            <div style="width: 72px; height: 72px; border-radius: var(--radius-full); background: var(--surface-subtle); display: flex; align-items: center; justify-content: center; font-size: 32px; border: 2px solid var(--primary); box-shadow: 0 0 16px var(--primary-tint);">
              👨‍💻
            </div>

            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h1 style="margin-bottom: 4px;">u/${window.utils.escapeHTML(user.username)}</h1>
                  <div style="display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--text-secondary);">
                    <span class="chip chip-mod">${user.role || 'USER'}</span>
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
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Debate jerárquico ltree</div>
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

  openEditModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'edit-profile-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3 style="margin-bottom: var(--space-md);">Actualizar Perfil</h3>
        <div class="form-group">
          <label class="form-label">Biografía Técnica</label>
          <textarea id="edit-bio" class="form-textarea" rows="3" placeholder="Describe tu stack tecnológico, proyectos cloud...">${window.api.user.bio || ''}</textarea>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--space-md);">
          <button class="btn btn-ghost" onclick="document.getElementById('edit-profile-modal').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="ProfileView.saveProfile()">Guardar Cambios</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async saveProfile() {
    const bio = document.getElementById('edit-bio').value.trim();
    try {
      await window.api.updateProfile({ bio });
      document.getElementById('edit-profile-modal').remove();
      window.utils.showToast('Perfil actualizado con éxito', 'info');
      await this.loadProfile(window.api.user.username);
    } catch (err) {
      window.utils.showToast(err.message || 'Error al actualizar', 'error');
    }
  }
};
