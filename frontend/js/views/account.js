/**
 * Cuenta: 01_07/06_89 sesiones activas (cerrar una, cerrar las demás y rotar credenciales),
 * 06_90 centro de exportación de datos y descarga (tamaño, SHA-256, JSON/CSV),
 * 06_86 eliminar cuenta con doble confirmación y 06_74 periodo de gracia (cancelar eliminación).
 * Añade secciones a SettingsView y la página /account/deletion.
 */

(function () {
  const S = window.SettingsView;
  const before = S.sections.findIndex(s => s.id === 'age');
  S.sections.splice(before + 1, 0,
    { id: 'sessions', label: 'Sesiones activas', icon: 'devices', desc: 'Dispositivos con tu cuenta abierta' },
    { id: 'data', label: 'Tus datos', icon: 'download', desc: 'Exporta una copia de todo lo que publicaste' },
    { id: 'appeals', label: 'Sanciones y apelaciones', icon: 'gavel', desc: 'Historial y revisión de decisiones' },
    { id: 'delete', label: 'Eliminar cuenta', icon: 'person_remove', desc: 'Borrado con 14 días para arrepentirte' }
  );

  const unavailable = panel => {
    panel.innerHTML = UI.empty({ icon: 'construction', title: 'Función no disponible todavía', text: 'El servidor aún no tiene aplicada la migración V003. Vuelve a intentarlo más tarde.' });
  };

  // Lectura legible del agente de usuario: navegador y sistema
  const device = ua => {
    ua = ua || '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici|Go-http/i.test(ua) ? 'Cliente de API' : 'Navegador';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Sistema desconocido';
    const icon = /Android|iPhone/.test(ua) ? 'smartphone' : /iPad/.test(ua) ? 'tablet' : browser === 'Cliente de API' ? 'terminal' : 'computer';
    return { browser, os, icon };
  };

  // ---------- 01_07 / 06_89 Sesiones activas ----------
  S.sessions = async function (panel) {
    panel.innerHTML = UI.skeletonPosts(2);
    let data;
    try { data = await window.api.listSessions(); } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') return unavailable(panel);
      panel.innerHTML = UI.error(err, "SettingsView.render('sessions')");
      return;
    }
    const items = data.items || [];
    const others = items.filter(s => !s.current).length;
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-headline-md">Sesiones activas</h2>
            <p class="mt-1 text-body-sm text-ink-secondary">${items.length} ${items.length === 1 ? 'dispositivo tiene' : 'dispositivos tienen'} tu cuenta abierta. Si no reconoces alguno, ciérralo y cambia tu contraseña.</p>
          </div>
          <button class="btn-danger-ghost" ${others ? '' : 'disabled'} onclick="SettingsView.revokeOthers()">${UI.icon('phonelink_erase', 'text-[18px]')} Cerrar las demás</button>
        </div>
        <div class="mt-5 divide-y divide-line rounded border border-line bg-surface-base">
          ${items.map(s => {
            const d = device(s.user_agent);
            return `
              <div class="flex flex-wrap items-center gap-3 p-4">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded ${s.current ? 'bg-primary/10 text-primary' : 'bg-surface-elevated text-ink-secondary'}">${UI.icon(d.icon)}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-label-lg">${d.browser} en ${d.os}${s.current ? '<span class="chip-primary">Este dispositivo</span>' : ''}</div>
                  <div class="font-mono text-body-sm text-ink-muted">${UI.esc(s.ip_address || 'IP desconocida')} · inicio ${window.utils.formatTime(s.created_at)} · activa ${window.utils.formatTime(s.last_seen_at)}</div>
                </div>
                ${s.current
                  ? `<button class="btn-ghost btn-sm" onclick="Router.logout()">${UI.icon('logout', 'text-[17px]')} Cerrar sesión</button>`
                  : `<button class="btn-danger-ghost btn-sm" onclick="SettingsView.revokeSession(${UI.arg(s.id)})">${UI.icon('close', 'text-[17px]')} Cerrar</button>`}
              </div>`;
          }).join('') || '<p class="p-4 text-body-sm text-ink-muted">No hay sesiones registradas.</p>'}
        </div>
      </div>
      <div class="card mt-4 flex items-start gap-3">
        ${UI.icon('shield_lock', 'text-secondary')}
        <div class="text-body-sm text-ink-secondary">
          <div class="text-label-lg text-ink">Rotación de credenciales</div>
          «Cerrar las demás» invalida al instante los tokens de los otros dispositivos y emite credenciales nuevas para este, sin que tengas que volver a iniciar sesión.
        </div>
      </div>`;
  };

  S.revokeSession = async function (id) {
    const ok = await UI.confirm({ title: '¿Cerrar esta sesión?', text: 'El dispositivo tendrá que volver a iniciar sesión.', confirmText: 'Cerrar sesión', danger: true, icon: 'devices' });
    if (!ok) return;
    try {
      await window.api.revokeSession(id);
      window.utils.showToast('Sesión cerrada', 'info');
      this.sessions(document.getElementById('settings-panel'));
    } catch (err) { StatusView.toastError(err, 'No se pudo cerrar la sesión'); }
  };

  S.revokeOthers = async function () {
    const ok = await UI.confirm({ title: '¿Cerrar todas las demás sesiones?', text: 'Se cerrarán todos los otros dispositivos y se renovarán las credenciales de este.', confirmText: 'Cerrar y rotar', danger: true, icon: 'phonelink_erase' });
    if (!ok) return;
    try {
      const res = await window.api.revokeOtherSessions();
      window.utils.showToast(res.message || 'Sesiones cerradas', 'info');
      this.sessions(document.getElementById('settings-panel'));
    } catch (err) { StatusView.toastError(err, 'No se pudieron cerrar las sesiones'); }
  };

  // ---------- 06_90 Exportación de datos ----------
  const labels = {
    posts: ['Publicaciones', 'article'], comments: ['Comentarios', 'chat_bubble'], post_votes: ['Votos a publicaciones', 'thumb_up'],
    comment_votes: ['Votos a comentarios', 'thumbs_up_down'], communities: ['Comunidades creadas', 'groups'], chat_messages: ['Mensajes privados', 'forum'],
    notifications: ['Notificaciones', 'notifications'], saved_posts: ['Guardados', 'bookmark'], collections: ['Colecciones', 'folder'],
    reports_filed: ['Denuncias enviadas', 'flag'], access_requests: ['Solicitudes de acceso', 'lock_open'], appeals: ['Apelaciones', 'gavel'], sessions: ['Sesiones', 'devices']
  };

  S.data = async function (panel) {
    panel.innerHTML = UI.skeletonPosts(2);
    let sum;
    try { sum = await window.api.exportSummary(); } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') return unavailable(panel);
      panel.innerHTML = UI.error(err, "SettingsView.render('data')");
      return;
    }
    const counts = sum.counts || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <h2 class="text-headline-md">Exporta tus datos</h2>
        <p class="mt-1 text-body-sm text-ink-secondary">Una copia legible por máquina de tu perfil y de todo lo que creaste en Forfunable (${total.toLocaleString('es')} registros). No incluye tu contraseña ni datos de otros usuarios.</p>
        <div class="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div class="flex items-center gap-3 rounded border border-line bg-surface-base p-3">${UI.icon('badge', 'text-secondary')}<div class="flex-1 text-body-sm">Perfil</div><span class="font-mono text-body-sm text-ink-muted">1</span></div>
          ${Object.entries(labels).map(([k, [l, i]]) => `
            <div class="flex items-center gap-3 rounded border border-line bg-surface-base p-3">${UI.icon(i, 'text-secondary')}<div class="flex-1 text-body-sm">${l}</div><span class="font-mono text-body-sm ${counts[k] ? 'text-ink' : 'text-ink-muted'}">${(counts[k] || 0).toLocaleString('es')}</span></div>`).join('')}
        </div>
        <div class="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
          <span class="text-body-sm text-ink-muted">Formato forfunable-export/v1 · JSON UTF-8</span>
          <button class="btn-primary px-5" id="btn-export" onclick="SettingsView.generateExport(this)">${UI.icon('package_2', 'text-[18px]')} Generar archivo</button>
        </div>
      </div>
      <div id="export-ready" class="mt-4"></div>`;
  };

  const toCSV = rows => {
    if (!rows || !rows.length) return '';
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const cell = v => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  };

  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sha256 = async text => {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;

  S.generateExport = async function (btn) {
    btn.disabled = true;
    btn.innerHTML = `${UI.icon('progress_activity', 'animate-spin text-[18px]')} Preparando…`;
    try {
      const payload = await window.api.exportData();
      const json = JSON.stringify(payload, null, 2);
      const hash = await sha256(json);
      const bytes = new TextEncoder().encode(json).length;
      const date = new Date(payload.exported_at || Date.now());
      this._export = { payload, json, name: `forfunable-datos-${date.toISOString().slice(0, 10)}` };
      const tables = Object.entries(payload.data || {}).filter(([, v]) => Array.isArray(v) && v.length);
      document.getElementById('export-ready').innerHTML = `
        <div class="card border-primary/30 p-5 sm:p-6">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">${UI.icon('task_alt')}</span>
            <div class="min-w-0 flex-1">
              <h3 class="text-headline-sm">Tu archivo está listo</h3>
              <p class="text-body-sm text-ink-secondary">Generado ${date.toLocaleString('es')}. Se crea en tu navegador; no se guarda copia en el servidor.</p>
            </div>
          </div>
          <dl class="mt-4 grid gap-2 rounded border border-line bg-surface-base p-4 font-mono text-body-sm sm:grid-cols-[120px_1fr]">
            <dt class="text-ink-muted">Archivo</dt><dd class="break-all">${UI.esc(this._export.name)}.json</dd>
            <dt class="text-ink-muted">Tamaño</dt><dd>${size(bytes)}</dd>
            <dt class="text-ink-muted">Formato</dt><dd>${UI.esc(payload.format || 'json')}</dd>
            ${hash ? `<dt class="text-ink-muted">SHA-256</dt><dd class="break-all text-secondary" id="export-hash">${hash}</dd>` : ''}
          </dl>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <button class="btn-primary" onclick="SettingsView.downloadExport('json')">${UI.icon('download', 'text-[18px]')} Descargar JSON</button>
            ${tables.length ? `
              <select id="export-table" class="input w-auto py-2 text-body-sm">${tables.map(([k, v]) => `<option value="${k}">${(labels[k] || [k])[0]} (${v.length})</option>`).join('')}</select>
              <button class="btn-secondary" onclick="SettingsView.downloadExport('csv')">${UI.icon('table_view', 'text-[18px]')} Descargar CSV</button>` : ''}
            ${hash ? `<button class="btn-ghost btn-sm ml-auto" onclick="navigator.clipboard && navigator.clipboard.writeText(${UI.arg(hash)}).then(() => utils.showToast('Huella copiada', 'info'))">${UI.icon('content_copy', 'text-[17px]')} Copiar huella</button>` : ''}
          </div>
          <p class="mt-3 text-body-sm text-ink-muted">Comprueba la integridad con <code>sha256sum ${UI.esc(this._export.name)}.json</code>.</p>
        </div>`;
    } catch (err) {
      StatusView.toastError(err, 'No se pudo generar la exportación');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${UI.icon('package_2', 'text-[18px]')} Generar de nuevo`;
    }
  };

  S.downloadExport = function (kind) {
    const e = this._export;
    if (!e) return;
    if (kind === 'json') return download(`${e.name}.json`, e.json, 'application/json;charset=utf-8');
    const key = document.getElementById('export-table').value;
    download(`${e.name}-${key}.csv`, toCSV(e.payload.data[key]), 'text/csv;charset=utf-8');
  };

  // ---------- 01_11 Sanciones y apelaciones (atajo a la página completa) ----------
  S.appeals = function () { Router.navigate('/appeals', { replace: true }); };

  // ---------- 06_86 Eliminar cuenta ----------
  S.delete = async function (panel) {
    const me = this.me;
    let pending = null;
    try { pending = (await window.api.getDeletion()).deletion; } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') return unavailable(panel);
    }
    if (pending) return Router.navigate('/account/deletion', { replace: true });
    panel.innerHTML = `
      <div class="card border-danger/30 p-5 sm:p-6">
        <h2 class="flex items-center gap-2 text-headline-md text-danger">${UI.icon('warning')} Eliminar tu cuenta</h2>
        <p class="mt-1 text-body-sm text-ink-secondary">Tendrás <strong class="text-ink">14 días</strong> para cambiar de opinión. Pasado ese plazo:</p>
        <ul class="mt-3 flex flex-col gap-2 text-body-sm text-ink-secondary">
          <li class="flex items-start gap-2">${UI.icon('person_off', 'text-[17px] text-danger')}Tu perfil, correo y biografía se anonimizan y nadie podrá iniciar sesión con ellos.</li>
          <li class="flex items-start gap-2">${UI.icon('article', 'text-[17px] text-warning')}Tus publicaciones y comentarios se conservan como de «usuario eliminado» para no romper las discusiones.</li>
          <li class="flex items-start gap-2">${UI.icon('logout', 'text-[17px] text-ink-muted')}Se cierran ahora mismo todas tus sesiones.</li>
        </ul>
        <a href="/settings/data" data-link class="mt-4 inline-flex items-center gap-1.5 text-body-sm text-secondary hover:underline">${UI.icon('download', 'text-[16px]')} Antes, descarga una copia de tus datos</a>

        <div class="mt-6 border-t border-line pt-5">
          <label class="label" for="del-reason">¿Por qué te vas? (opcional)</label>
          <select id="del-reason" class="input mb-4">
            <option value="">Prefiero no decirlo</option>
            <option>Ya no uso Forfunable</option>
            <option>Me preocupa mi privacidad</option>
            <option>Tengo otra cuenta</option>
            <option>No encuentro contenido que me interese</option>
            <option>Otro motivo</option>
          </select>
          ${UI.field('del-username', `Escribe <span class="font-mono text-ink">${UI.esc(me.username)}</span> para confirmar`, { attrs: 'autocomplete="off" oninput="SettingsView.deleteReady()"' })}
          ${UI.field('del-password', 'Tu contraseña', { type: 'password', attrs: 'autocomplete="current-password" oninput="SettingsView.deleteReady()"' })}
          <label class="flex cursor-pointer items-start gap-3 rounded border border-line bg-surface-base p-4">
            <input id="del-ack" type="checkbox" class="mt-1 h-4 w-4 accent-[#ff5252]" onchange="SettingsView.deleteReady()">
            <span class="text-body-sm text-ink-secondary">Entiendo que, si no cancelo en 14 días, la eliminación es definitiva.</span>
          </label>
          <div class="mt-6 flex justify-end gap-2">
            <a href="/settings" data-link class="btn-ghost">Cancelar</a>
            <button class="btn-danger px-5" id="btn-delete" disabled onclick="SettingsView.requestDeletion(this)">${UI.icon('person_remove', 'text-[18px]')} Eliminar mi cuenta</button>
          </div>
        </div>
      </div>`;
  };

  S.deleteReady = function () {
    const typed = document.getElementById('del-username').value.trim().toLowerCase() === this.me.username.toLowerCase();
    const ok = typed && document.getElementById('del-password').value && document.getElementById('del-ack').checked;
    document.getElementById('btn-delete').disabled = !ok;
    return ok;
  };

  S.requestDeletion = async function (btn) {
    if (!this.deleteReady()) return;
    btn.disabled = true;
    try {
      const res = await window.api.requestDeletion(document.getElementById('del-password').value, document.getElementById('del-username').value.trim(), document.getElementById('del-reason').value);
      AccountView._scheduled = res.deletion;
      Router.navigate('/account/deletion');
    } catch (err) {
      btn.disabled = false;
      if (err.status === 401) return UI.setHint('del-password', err.message);
      if (err.status === 400) return UI.setHint('del-username', err.message);
      StatusView.toastError(err, 'No se pudo programar la eliminación');
    }
  };
})();

// Al cerrar o perder la sesión se vuelve a comprobar la eliminación pendiente en el siguiente inicio
window.api.onAuthChange(u => { if (!u && window.Router) Router._deletionChecked = null; });

// 06_74 Eliminación programada: cuenta atrás y cancelación
window.AccountView = {
  _scheduled: null,

  async deletion() {
    Router.setLayout('wide');
    let d = this._scheduled;
    const logged = !!window.api.user;
    if (logged) {
      try { d = (await window.api.getDeletion()).deletion; } catch (err) { return StatusView.fromError(err, () => this.deletion()); }
      if (!d) {
        $main().innerHTML = UI.empty({ icon: 'verified_user', title: 'Tu cuenta está activa', text: 'No hay ninguna eliminación pendiente.', action: '<a href="/" data-link class="btn-primary">Ir al feed</a>' });
        return;
      }
    }
    if (!d) return Router.navigate('/login', { replace: true });
    const purge = new Date(d.purge_after);
    const left = Math.max(0, purge - Date.now());
    const days = Math.floor(left / 86400000);
    const hours = Math.floor((left % 86400000) / 3600000);
    const pct = Math.min(100, Math.round(((Date.now() - new Date(d.requested_at)) / (purge - new Date(d.requested_at))) * 100));
    $main().innerHTML = `
      <div class="mx-auto max-w-xl">
        <div class="card p-6 text-center sm:p-8">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">${UI.icon('hourglass_top', 'text-[30px]')}</span>
          <h1 class="mt-4 text-headline-lg">Eliminación de cuenta programada</h1>
          <p class="mt-2 text-body-md text-ink-secondary">Tu cuenta se eliminará el <strong class="text-ink">${purge.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>
          <div class="mt-6 flex justify-center gap-3 font-mono">
            <div class="rounded border border-line bg-surface-base px-5 py-3"><div class="text-headline-xl">${days}</div><div class="text-label-sm uppercase text-ink-muted">días</div></div>
            <div class="rounded border border-line bg-surface-base px-5 py-3"><div class="text-headline-xl">${hours}</div><div class="text-label-sm uppercase text-ink-muted">horas</div></div>
          </div>
          <div class="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-base"><div class="h-full rounded-full bg-warning" style="width:${pct}%"></div></div>
          <p class="mt-2 text-body-sm text-ink-muted">Solicitada ${new Date(d.requested_at).toLocaleString('es')}${d.reason ? ` · «${UI.esc(d.reason)}»` : ''}</p>
          ${logged
            ? `<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                 <button class="btn-primary px-5" onclick="AccountView.cancel(this)">${UI.icon('undo', 'text-[18px]')} Cancelar eliminación y conservar mi cuenta</button>
                 <button class="btn-ghost" onclick="Router.logout()">Salir</button>
               </div>`
            : `<p class="mt-6 text-body-md text-ink-secondary">Hemos cerrado todas tus sesiones. Si cambias de opinión, inicia sesión antes de esa fecha y cancela la eliminación.</p>
               <div class="mt-4 flex justify-center gap-2"><a href="/login" data-link class="btn-secondary">Iniciar sesión</a><a href="/" data-link class="btn-ghost">Ir al inicio</a></div>`}
        </div>
      </div>`;
  },

  async cancel(btn) {
    btn.disabled = true;
    try {
      await window.api.cancelDeletion();
      Router._deletionChecked = null;
      window.utils.showToast('Eliminación cancelada: tu cuenta sigue activa', 'info');
      Router.navigate('/');
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo cancelar');
    }
  },

  // Tras iniciar sesión: si hay una eliminación pendiente, se muestra antes que nada
  async checkPending(path) {
    const u = window.api.user;
    if (!u || Router._deletionChecked === u.id || path === '/account/deletion') return false;
    Router._deletionChecked = u.id;
    try {
      const d = (await window.api.getDeletion()).deletion;
      if (d) { Router.navigate('/account/deletion', { replace: true }); return true; }
    } catch (_) {}
    return false;
  }
};
