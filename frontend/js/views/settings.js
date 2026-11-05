/**
 * 01_07 Centro de ajustes, 01_04 Editar perfil y previsualización de tarjeta, 01_09 Ajustes de perfil
 * e identidad pública, 01_05 Estado de presencia y visibilidad, 05_33 Ajustes de notificaciones,
 * seguridad (contraseña) y 01_06 Verificación de edad (+18).
 * Conectada a /api/v1/users/me/*, /api/v1/notifications/settings.
 */

window.SettingsView = {
  sections: [
    { id: 'profile', label: 'Identidad pública', icon: 'badge', desc: 'Foto, nombre de usuario, correo y biografía' },
    { id: 'presence', label: 'Presencia y visibilidad', icon: 'visibility', desc: 'Cómo te ven los demás' },
    { id: 'notifications', label: 'Notificaciones', icon: 'notifications', desc: 'Canales y tipos de avisos' },
    { id: 'security', label: 'Seguridad', icon: 'lock', desc: 'Contraseña y sesión' },
    { id: 'age', label: 'Verificación de edad', icon: 'verified_user', desc: 'Acceso a comunidades +18' }
  ],

  async render(section) {
    const me = await window.api.getMe();
    this.me = me;
    const valid = this.sections.find(s => s.id === section);
    if (section !== 'home' && !valid) return StatusView.page('404', { path: window.location.pathname });
    $main().innerHTML = `
      ${UI.pageHeader('Centro de ajustes', 'Gestiona tu identidad, privacidad, avisos y seguridad.', '', 'settings')}
      <div class="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav class="card flex h-fit flex-col gap-0.5 p-2">
          ${this.sections.map(s => `<a href="/settings/${s.id}" data-link class="nav-item ${s.id === section ? 'active' : ''}">${UI.icon(s.icon, 'text-[19px]')}${s.label}</a>`).join('')}
          <a href="/u/${encodeURIComponent(me.username)}" data-link class="nav-item mt-2 border-t border-line pt-3">${UI.icon('person', 'text-[19px]')}Ver mi perfil público</a>
        </nav>
        <div id="settings-panel"></div>
      </div>`;
    const panel = document.getElementById('settings-panel');
    if (section === 'home') return this.home(panel);
    return this[section](panel);
  },

  // 01_07 Centro de ajustes
  home(panel) {
    const me = this.me;
    panel.innerHTML = `
      <div class="card mb-4 flex flex-wrap items-center gap-4">
        ${UI.avatar(me, 56)}
        <div class="min-w-0 flex-1"><div class="text-headline-md">@${UI.esc(me.username)}</div><div class="text-body-sm text-ink-secondary">${UI.esc(me.email)} · ${UI.rank(me.karma_score).name}</div></div>
        <a href="/settings/profile" data-link class="btn-secondary">${UI.icon('edit', 'text-[18px]')} Editar</a>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        ${this.sections.map(s => `
          <a href="/settings/${s.id}" data-link class="card card-hover flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-secondary">${UI.icon(s.icon)}</span>
            <span><span class="block text-headline-sm">${s.label}</span><span class="block text-body-sm text-ink-secondary">${s.desc}</span></span>
          </a>`).join('')}
      </div>
      <div class="card mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><div class="text-label-lg">Modo ligero</div><div class="text-body-sm text-ink-secondary">No carga imágenes; útil con conexiones lentas o datos limitados.</div></div>
        <button class="switch ${StatusView.isLite() ? 'on' : ''}" ${UI.on('click', 'StatusView.toggleLite', UI.EL)} aria-label="Modo ligero"></button>
      </div>`;
  },

  // 01_04 / 01_09 Identidad pública con vista previa de la tarjeta
  profile(panel) {
    const me = this.me;
    panel.innerHTML = `
      <div class="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div class="card p-5 sm:p-6">
          <h2 class="text-headline-md">Identidad pública</h2>
          <p class="mb-5 mt-1 text-body-sm text-ink-secondary">Así te presentas en publicaciones, comentarios y el directorio de miembros.</p>
          ${UI.field('edit-avatar', 'Foto de perfil (enlace a una imagen)', { type: 'url', placeholder: 'https://…/foto.jpg', value: me.avatar_url || '', help: 'Ej: https://github.com/tu_usuario.png. Déjalo vacío para usar tu inicial.', attrs: UI.on('input', 'SettingsView.validateProfile', 'edit-avatar') })}
          ${UI.field('edit-username', 'Nombre de usuario', { value: me.username, attrs: `autocomplete="username" ${UI.on('input', 'SettingsView.validateProfile', 'edit-username')}` })}
          ${UI.field('edit-email', 'Correo electrónico (privado)', { type: 'email', value: me.email || '', attrs: `autocomplete="email" ${UI.on('input', 'SettingsView.validateProfile', 'edit-email')}` })}
          <div class="mb-1.5 flex justify-between"><label class="label mb-0" for="edit-bio">Biografía</label><span id="edit-bio-count" class="font-mono text-body-sm text-ink-muted"></span></div>
          <textarea id="edit-bio" class="input" rows="4" maxlength="300" placeholder="Stack, intereses, proyectos…" ${UI.on('input', 'SettingsView.validateProfile', 'edit-bio')}>${UI.esc(UI.plain(me.bio || ''))}</textarea>
          <div class="mt-6 flex justify-end gap-2 border-t border-line pt-5">
            <a href="/settings" data-link class="btn-ghost">Cancelar</a>
            <button class="btn-primary px-5" id="btn-save-profile" ${UI.on('click', 'SettingsView.saveProfile')}>${UI.icon('save', 'text-[18px]')} Guardar cambios</button>
          </div>
        </div>
        <div>
          <div class="mb-2 text-label-sm uppercase tracking-wider text-ink-muted">Vista previa de tu tarjeta</div>
          <div id="profile-card-preview"></div>
        </div>
      </div>`;
    this.validateProfile('edit-bio');
  },

  previewCard() {
    const v = id => document.getElementById(id).value.trim();
    const url = v('edit-avatar');
    const u = { username: v('edit-username') || this.me.username, avatar_url: /^https?:\/\/\S+\.\S+/i.test(url) ? url : '', presence_status: this.me.presence_status };
    const r = UI.rank(this.me.karma_score);
    document.getElementById('profile-card-preview').innerHTML = `
      <div class="card overflow-hidden p-0">
        <div class="h-16 bg-gradient-to-r from-primary/20 via-secondary/15 to-transparent"></div>
        <div class="-mt-8 px-4 pb-4">
          ${UI.avatar(u, 64)}
          <div class="mt-2 text-headline-sm">@${UI.esc(u.username)}</div>
          <span class="chip-community mt-1">${UI.icon(r.icon, 'text-[13px]')} ${r.name}</span>
          <p class="mt-2 line-clamp-3 text-body-sm text-ink-secondary">${UI.esc(document.getElementById('edit-bio').value.trim() || 'Sin biografía')}</p>
          <div class="mt-3 font-mono text-body-sm text-primary">${this.me.karma_score} karma</div>
        </div>
      </div>`;
  },

  validateProfile(id) {
    const v = AuthView.validators;
    const val = document.getElementById(id).value.trim();
    let ok = true;
    if (id === 'edit-username') ok = UI.setHint(id, v.username(val));
    if (id === 'edit-email') ok = UI.setHint(id, v.email(val));
    if (id === 'edit-avatar') ok = UI.setHint(id, !val || /^https?:\/\/\S+\.\S+/i.test(val) ? '' : 'El enlace debe empezar por https:// (ej: https://sitio.com/foto.jpg).');
    if (id === 'edit-bio') document.getElementById('edit-bio-count').textContent = `${document.getElementById('edit-bio').value.length} / 300`;
    this.previewCard();
    return ok;
  },

  async saveProfile() {
    const invalid = ['edit-avatar', 'edit-username', 'edit-email'].find(id => !this.validateProfile(id));
    if (invalid) return document.getElementById(invalid).focus();
    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;
    const v = id => document.getElementById(id).value.trim();
    const username = v('edit-username');
    try {
      await window.api.updateProfile({ username, email: v('edit-email'), avatar_url: v('edit-avatar'), bio: v('edit-bio') });
      // El token lleva el nombre de usuario: se renueva para que el resto de la app use el nuevo
      if (username !== this.me.username) await window.api.refreshToken();
      await window.api.getMe();
      window.utils.showToast('Perfil actualizado', 'info');
      Router.navigate(`/u/${encodeURIComponent(window.api.user.username)}`);
    } catch (err) {
      btn.disabled = false;
      if (err.status === 409) {
        const field = /correo/i.test(err.message) ? 'edit-email' : 'edit-username';
        return UI.setHint(field, err.message);
      }
      StatusView.toastError(err, 'No se pudo guardar el perfil');
    }
  },

  // 01_05 Estado de presencia y visibilidad pública
  presence(panel) {
    const opts = [
      ['ONLINE', 'En línea', 'Apareces disponible para mensajes y menciones.', 'bg-primary'],
      ['BUSY', 'Ocupado', 'Los demás ven que estás concentrado; puedes seguir recibiendo mensajes.', 'bg-danger'],
      ['OFFLINE', 'Invisible', 'Te muestras como desconectado aunque estés usando Forfunable.', 'bg-ink-muted']
    ];
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <h2 class="text-headline-md">Estado de presencia</h2>
        <p class="mb-5 mt-1 text-body-sm text-ink-secondary">Se muestra junto a tu foto en el perfil, el chat y el directorio.</p>
        <div class="flex flex-col gap-2" id="presence-options">
          ${opts.map(([v, l, d, c]) => `
            <button type="button" data-status="${v}" class="flex items-start gap-3 rounded border p-4 text-left transition-colors ${this.me.presence_status === v ? 'border-primary bg-primary/5' : 'border-line bg-surface-base hover:border-line-strong'}" ${UI.on('click', 'SettingsView.setPresence', v)}>
              <span class="mt-1 h-3 w-3 shrink-0 rounded-full ${c}"></span>
              <span class="flex-1"><span class="block text-label-lg">${l}</span><span class="block text-body-sm text-ink-secondary">${d}</span></span>
              ${this.me.presence_status === v ? UI.icon('check_circle', 'text-primary') : ''}
            </button>`).join('')}
        </div>
      </div>
      <div class="card mt-4">
        <h3 class="text-headline-sm">Qué es público en tu perfil</h3>
        <ul class="mt-3 grid gap-2 text-body-sm text-ink-secondary sm:grid-cols-2">
          ${['Nombre de usuario y foto', 'Biografía y fecha de alta', 'Karma, rango y publicaciones', 'Estado de presencia'].map(t => `<li class="flex items-center gap-2">${UI.icon('public', 'text-[16px] text-secondary')}${t}</li>`).join('')}
          ${['Correo electrónico', 'Contraseña y sesiones'].map(t => `<li class="flex items-center gap-2">${UI.icon('lock', 'text-[16px] text-primary')}${t} (privado)</li>`).join('')}
        </ul>
      </div>`;
  },

  async setPresence(status) {
    try {
      await window.api.updateStatus(status);
      this.me = await window.api.getMe();
      window.utils.showToast('Estado actualizado', 'info');
      this.presence(document.getElementById('settings-panel'));
      Router.updateNavbar();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo actualizar el estado');
    }
  },

  // 05_33 Ajustes de notificaciones y canales de entrega
  async notifications(panel) {
    panel.innerHTML = UI.skeletonPosts(1);
    let s = {};
    try { s = await window.api.getNotificationSettings(); } catch (_) {}
    const rows = [
      ['email_on_reply', 'Respuestas a mis publicaciones y comentarios', 'Cuando alguien comenta tu publicación o responde a tu comentario.', 'reply'],
      ['email_on_mention', 'Menciones', 'Cuando alguien te menciona con @usuario.', 'alternate_email'],
      ['push_on_chat_request', 'Mensajes y solicitudes de chat', 'Solicitudes nuevas, solicitudes aceptadas y mensajes privados.', 'chat'],
      ['push_on_community_update', 'Novedades de mis comunidades', 'Nuevos miembros en las comunidades que fundaste.', 'groups']
    ];
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <h2 class="text-headline-md">Notificaciones</h2>
        <p class="mb-5 mt-1 text-body-sm text-ink-secondary">Elige de qué quieres enterarte además de los avisos dentro de la app.</p>
        <div class="divide-y divide-line rounded border border-line bg-surface-base">
          ${rows.map(([k, t, d, i]) => `
            <div class="flex items-start gap-3 p-4">
              ${UI.icon(i, 'text-ink-secondary')}
              <div class="flex-1"><div class="text-label-lg">${t}</div><div class="text-body-sm text-ink-secondary">${d}</div></div>
              <button type="button" class="switch ${s[k] ? 'on' : ''}" data-setting="${k}" ${UI.on('click', 'UI.toggleClass', UI.EL, 'on')} aria-label="${t}"></button>
            </div>`).join('')}
        </div>
        <p class="mt-3 flex items-start gap-2 text-body-sm text-ink-muted">${UI.icon('info', 'text-[16px]')} El centro de notificaciones siempre recibe los avisos. Estas preferencias guardan qué canales externos (correo y push) quieres usar.</p>
        <div class="mt-5 flex justify-end"><button class="btn-primary px-5" ${UI.on('click', 'SettingsView.saveNotifications', UI.EL)}>${UI.icon('save', 'text-[18px]')} Guardar preferencias</button></div>
      </div>`;
  },

  async saveNotifications(btn) {
    btn.disabled = true;
    const body = {};
    document.querySelectorAll('[data-setting]').forEach(el => { body[el.dataset.setting] = el.classList.contains('on'); });
    try {
      await window.api.updateNotificationSettings(body);
      window.utils.showToast('Preferencias de notificación guardadas', 'info');
    } catch (err) {
      StatusView.toastError(err, 'No se pudieron guardar');
    } finally {
      btn.disabled = false;
    }
  },

  // Seguridad: cambio de contraseña y cierre de sesión
  security(panel) {
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <h2 class="text-headline-md">Cambiar contraseña</h2>
        <p class="mb-5 mt-1 text-body-sm text-ink-secondary">Necesitas tu contraseña actual. Se guarda cifrada con bcrypt.</p>
        ${UI.field('sec-current', 'Contraseña actual', { type: 'password', attrs: 'autocomplete="current-password"' })}
        <label class="label" for="sec-new">Nueva contraseña</label>
        <input id="sec-new" type="password" class="input" autocomplete="new-password" ${UI.on('input', 'SettingsView.passwordRules')}>
        <ul id="sec-rules" class="mt-2 flex flex-col gap-0.5 text-body-sm text-ink-muted"></ul>
        <div class="mt-6 flex justify-end"><button class="btn-primary px-5" ${UI.on('click', 'SettingsView.changePassword', UI.EL)}>${UI.icon('key', 'text-[18px]')} Actualizar contraseña</button></div>
      </div>
      <div class="card mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><div class="text-label-lg">Sesión en este navegador</div><div class="text-body-sm text-ink-secondary">La sesión se renueva automáticamente mientras la uses.</div></div>
        <button class="btn-danger-ghost" ${UI.on('click', 'Router.logout')}>${UI.icon('logout', 'text-[18px]')} Cerrar sesión</button>
      </div>`;
    this.passwordRules();
  },

  passwordRules(show = false) {
    const v = document.getElementById('sec-new').value;
    const rules = AuthView.validators.passwordRules(v);
    document.getElementById('sec-rules').innerHTML = rules.map(r => `<li class="flex items-center gap-1.5 ${r.ok ? 'text-primary' : show || v ? 'text-danger' : ''}">${UI.icon(r.ok ? 'check_circle' : 'cancel', 'text-[15px]')}${r.text}</li>`).join('');
    return rules.every(r => r.ok);
  },

  async changePassword(btn) {
    const current = document.getElementById('sec-current').value;
    if (!UI.setHint('sec-current', current ? '' : 'Escribe tu contraseña actual.')) return;
    if (!this.passwordRules(true)) return document.getElementById('sec-new').focus();
    btn.disabled = true;
    try {
      await window.api.changePassword(current, document.getElementById('sec-new').value);
      window.utils.showToast('Contraseña actualizada', 'info');
      document.getElementById('sec-current').value = '';
      document.getElementById('sec-new').value = '';
      this.passwordRules();
    } catch (err) {
      if (err.status === 401) UI.setHint('sec-current', err.message);
      else StatusView.toastError(err, 'No se pudo cambiar la contraseña');
    } finally {
      btn.disabled = false;
    }
  },

  // 01_06 Verificación técnica de edad (+18)
  age(panel) {
    const me = this.me;
    const next = new URLSearchParams(window.location.search).get('next');
    if (me.is_adult_verified) {
      panel.innerHTML = `
        <div class="card flex flex-col items-center px-6 py-10 text-center">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">${UI.icon('verified', 'icon-fill text-[30px]')}</span>
          <h2 class="mt-4 text-headline-md">Mayoría de edad verificada</h2>
          <p class="mt-1 text-body-md text-ink-secondary">Puedes acceder a las comunidades marcadas como +18.</p>
          ${next ? `<a href="${UI.esc(next)}" data-link class="btn-primary mt-5">Continuar</a>` : ''}
        </div>`;
      return;
    }
    const max = new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10);
    panel.innerHTML = `
      <div class="card p-5 sm:p-6">
        <h2 class="flex items-center gap-2 text-headline-md">${UI.icon('verified_user', 'text-secondary')} Verificación de edad</h2>
        <p class="mb-5 mt-1 text-body-sm text-ink-secondary">Algunas comunidades están en cuarentena para mayores de 18 años. Declara tu fecha de nacimiento para acceder.</p>
        ${UI.field('age-birth', 'Fecha de nacimiento', { type: 'date', attrs: `max="${max}"` })}
        <label class="flex cursor-pointer items-start gap-3 rounded border border-line bg-surface-base p-4">
          <input id="age-confirm" type="checkbox" class="mt-1 h-4 w-4 accent-[#00e676]">
          <span class="text-body-sm text-ink-secondary">Declaro que soy mayor de edad y entiendo que el contenido +18 puede incluir material sensible. Una declaración falsa puede terminar en la suspensión de la cuenta.</span>
        </label>
        <div class="field-hint" id="age-confirm-hint"></div>
        <div class="mt-6 flex justify-end"><button class="btn-primary px-5" ${UI.on('click', 'SettingsView.verifyAge', UI.EL, next || '')}>${UI.icon('verified', 'text-[18px]')} Verificar</button></div>
      </div>`;
  },

  async verifyAge(btn, next) {
    const birth = document.getElementById('age-birth').value;
    if (!birth) return UI.setHint('age-birth', 'Indica tu fecha de nacimiento.');
    const age = (Date.now() - new Date(birth).getTime()) / (365.25 * 86400000);
    if (age < 18) return UI.setHint('age-birth', 'Debes tener al menos 18 años.');
    UI.setHint('age-birth', '');
    if (!document.getElementById('age-confirm').checked) return UI.setHint('age-confirm', 'Marca la declaración para continuar.');
    btn.disabled = true;
    try {
      await window.api.verifyAge(`self-declared:${birth}`);
      await window.api.getMe();
      window.utils.showToast('Mayoría de edad verificada', 'info');
      if (next) Router.navigate(next); else this.render('age');
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo verificar');
    }
  }
};
