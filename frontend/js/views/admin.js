/**
 * Vista: Administración Global y Auditoría Inmutable (Pantalla Stitch 05-42 y 05-36)
 * Conectada a /api/v1/admin
 */

window.AdminView = {
  currentTab: 'users',

  async render(container) {
    if (!window.api.user || window.api.user.role !== 'GLOBAL_ADMIN') {
      container.innerHTML = `
        <div class="state-empty card" style="max-width: 600px; margin: 40px auto;">
          <h2 style="color: var(--error);">🔒 Acceso Restringido (403 Forbidden)</h2>
          <p>Se requieren permisos de Administrador Global (GLOBAL_ADMIN) para acceder a esta consola.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/')">Volver al Inicio</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="max-width: 1000px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
          <div>
            <h1>🛡️ Consola de Administración Global</h1>
            <p style="color: var(--text-secondary); font-size: 13px;">Gobernanza RBAC, moderación perimetral y logs inmutables</p>
          </div>
          <span class="chip chip-mod">GLOBAL_ADMIN</span>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: var(--space-md); border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
          <button class="btn ${this.currentTab === 'users' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminView.setTab('users')">Usuarios y Roles</button>
          <button class="btn ${this.currentTab === 'audit' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminView.setTab('audit')">Logs de Auditoría</button>
          <button class="btn ${this.currentTab === 'reports' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminView.setTab('reports')">Cola de Moderación</button>
        </div>

        <div id="admin-tab-content"></div>
      </div>
    `;

    await this.renderTabContent();
  },

  async setTab(tab) {
    this.currentTab = tab;
    await this.render(document.getElementById('main-view-container'));
  },

  async renderTabContent() {
    const contentEl = document.getElementById('admin-tab-content');
    contentEl.innerHTML = `<div class="skeleton-card"><div class="skeleton skeleton-title"></div></div>`;

    if (this.currentTab === 'users') {
      try {
        const users = await window.api.adminListUsers();
        contentEl.innerHTML = `
          <div class="card" style="padding: 0; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); background: var(--surface-subtle); text-align: left;">
                  <th style="padding: 10px 14px;">Usuario</th>
                  <th style="padding: 10px 14px;">Correo</th>
                  <th style="padding: 10px 14px;">Karma</th>
                  <th style="padding: 10px 14px;">Rol Actual</th>
                  <th style="padding: 10px 14px;">Acción RBAC</th>
                </tr>
              </thead>
              <tbody>
                ${(users || []).map(u => `
                  <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 10px 14px; font-weight: 600;">u/${window.utils.escapeHTML(u.username)}</td>
                    <td style="padding: 10px 14px; color: var(--text-secondary);">${window.utils.escapeHTML(u.email || '—')}</td>
                    <td style="padding: 10px 14px;"><span class="chip chip-karma">${u.karma_score || 0}</span></td>
                    <td style="padding: 10px 14px;"><span class="chip chip-mod">${u.role}</span></td>
                    <td style="padding: 10px 14px;">
                      <select class="form-select" style="padding: 4px 8px; font-size: 11px; width: auto;" onchange="AdminView.updateRole('${u.id}', this.value)">
                        <option value="USER" ${u.role === 'USER' ? 'selected' : ''}>USER</option>
                        <option value="COMMUNITY_MOD" ${u.role === 'COMMUNITY_MOD' ? 'selected' : ''}>COMMUNITY_MOD</option>
                        <option value="GLOBAL_ADMIN" ${u.role === 'GLOBAL_ADMIN' ? 'selected' : ''}>GLOBAL_ADMIN</option>
                      </select>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        contentEl.innerHTML = `<div class="state-error"><p>${err.message}</p></div>`;
      }
    } else if (this.currentTab === 'audit') {
      try {
        const logs = await window.api.adminGetAuditLogs();
        contentEl.innerHTML = `
          <div class="card" style="padding: 0; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: var(--font-mono);">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); background: var(--surface-subtle); text-align: left;">
                  <th style="padding: 8px 12px;">Timestamp</th>
                  <th style="padding: 8px 12px;">Actor</th>
                  <th style="padding: 8px 12px;">Acción</th>
                  <th style="padding: 8px 12px;">Detalle</th>
                </tr>
              </thead>
              <tbody>
                ${(logs || []).map(l => `
                  <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 8px 12px; color: var(--text-muted);">${window.utils.formatTime(l.created_at)}</td>
                    <td style="padding: 8px 12px; color: var(--secondary);">u/${l.actor_username || 'sistema'}</td>
                    <td style="padding: 8px 12px; color: var(--primary);">${l.action}</td>
                    <td style="padding: 8px 12px; color: var(--text-secondary);">${window.utils.escapeHTML(l.details || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        contentEl.innerHTML = `<div class="state-error"><p>${err.message}</p></div>`;
      }
    } else if (this.currentTab === 'reports') {
      try {
        const reports = await window.api.adminListReports();
        if (!reports || reports.length === 0) {
          contentEl.innerHTML = `<div class="state-empty"><p>No hay reportes ni denuncias pendientes.</p></div>`;
          return;
        }

        contentEl.innerHTML = reports.map(r => `
          <div class="card" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; color: var(--error);">Motivo: ${window.utils.escapeHTML(r.reason)}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Denunciado por u/${r.reporter_username || 'usuario'}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" style="font-size: 11px;" onclick="AdminView.resolveReport('${r.id}', 'DISMISS')">Descartar</button>
              <button class="btn btn-danger" style="font-size: 11px;" onclick="AdminView.resolveReport('${r.id}', 'RESOLVE_DELETE')">Sancionar / Borrar</button>
            </div>
          </div>
        `).join('');
      } catch (err) {
        contentEl.innerHTML = `<div class="state-error"><p>${err.message}</p></div>`;
      }
    }
  },

  async updateRole(userId, newRole) {
    try {
      await window.api.adminUpdateUserRole(userId, newRole);
      window.utils.showToast(`Rol actualizado a ${newRole}`, 'info');
    } catch (err) {
      window.utils.showToast(err.message || 'Error al actualizar rol', 'error');
    }
  },

  async resolveReport(reportId, action) {
    try {
      await window.api.adminResolveReport(reportId, action);
      window.utils.showToast('Reporte resuelto', 'info');
      await this.renderTabContent();
    } catch (err) {
      window.utils.showToast(err.message || 'Error al resolver reporte', 'error');
    }
  }
};
