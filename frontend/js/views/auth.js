/**
 * Acceso: 01_02 Iniciar sesión, 01_03 Crear cuenta, 06_85 Bienvenida y 01_01 Onboarding.
 * Conectada a /api/v1/auth/login, /api/v1/auth/register y /api/v1/communities.
 */

window.$main = () => document.getElementById('main-view-container');

window.AuthView = {
  pickStatus(btn) { document.querySelectorAll('#onb-status [data-status]').forEach(b => b.classList.toggle('border-primary', b === btn)); },

  currentTab: 'login',
  failedLogins: 0,

  // Reglas de validación; coinciden con las del backend (handlers/auth_handlers.go)
  validators: {
    username(v) {
      if (!v) return 'Escribe un nombre de usuario.';
      if (v.length < 3) {
        const n = 3 - v.length;
        return n === 1 ? 'Te falta 1 caracter: mínimo 3.' : `Te faltan ${n} caracteres: mínimo 3.`;
      }
      if (v.length > 30) return 'Máximo 30 caracteres.';
      if (!/^[a-zA-Z0-9_]+$/.test(v)) return 'Solo letras, números y guion bajo (_), sin espacios ni símbolos.';
      return '';
    },
    email(v) {
      if (!v) return 'Escribe tu correo electrónico.';
      if (/\s/.test(v)) return 'El correo no puede tener espacios.';
      if (!v.includes('@')) return 'Falta el símbolo @ (ej: nombre@gmail.com).';
      const [user, domain = ''] = v.split('@');
      if (!user) return 'Falta el nombre antes de la @.';
      if (v.split('@').length > 2) return 'El correo solo puede tener una @.';
      if (!domain) return 'Falta el dominio después de la @ (ej: gmail.com).';
      if (!/\.[a-zA-Z]{2,}$/.test(domain)) return 'Falta la terminación del dominio (ej: .com, .co).';
      return '';
    },
    loginPassword(v) {
      return v ? '' : 'Escribe tu contraseña.';
    },
    passwordRules(v) {
      return [
        { ok: v.length >= 8, text: 'Al menos 8 caracteres' },
        { ok: /[a-zA-Z]/.test(v), text: 'Al menos una letra' },
        { ok: /[0-9]/.test(v), text: 'Al menos un número' }
      ];
    }
  },

  render(tab = 'login') {
    if (window.api.user) return Router.navigate('/', { replace: true });
    this.currentTab = tab;
    const features = [
      ['verified_user', 'Reputación verificable', 'Cada aporte suma karma público y auditable por la comunidad.'],
      ['hub', 'Comunidades técnicas', 'Debates con hilos anidados, notas comunitarias y moderación transparente.'],
      ['lock', 'Seguridad por defecto', 'Contraseñas con bcrypt, sesión con JWT y protección CSRF y reCAPTCHA.']
    ];
    $main().innerHTML = `
      <div class="w-full max-w-[1000px] overflow-hidden rounded-xl border border-line bg-surface-card shadow-pop md:grid md:grid-cols-[1fr_1.1fr]">
        <section class="hidden flex-col justify-between gap-8 border-r border-line bg-gradient-to-br from-surface-elevated to-surface-card p-10 md:flex">
          <div>
            <span class="chip-primary">${UI.icon('circle', 'icon-fill text-[8px]')} Plataforma en Cloud Run</span>
            <p class="mt-8 text-label-sm uppercase tracking-widest text-ink-muted">Forfunable</p>
            <h1 class="mt-2 text-headline-xl text-balance">Comunidades técnicas sin ruido</h1>
            <p class="mt-3 text-body-lg text-ink-secondary">Debate, comparte y construye reputación junto a ingenieros, investigadores y equipos de producto.</p>
          </div>
          <ul class="flex flex-col gap-5">
            ${features.map(([icon, title, text]) => `
              <li class="flex gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-surface-base text-primary">${UI.icon(icon, 'text-[19px]')}</span>
                <span><span class="block text-label-lg text-ink">${title}</span><span class="block text-body-sm text-ink-secondary">${text}</span></span>
              </li>`).join('')}
          </ul>
          <a href="/status" data-link class="flex items-center gap-2 text-body-sm text-ink-muted hover:text-ink">${UI.icon('circle', 'icon-fill text-[9px] text-primary')} Estado del servicio</a>
        </section>

        <section class="flex flex-col p-6 sm:p-10">
          <div class="mb-6 flex items-center justify-between">
            <a href="/" data-link class="flex items-center gap-2 font-display text-headline-sm">
              <svg viewBox="0 0 100 100" class="h-6 w-6"><path d="M24 30h52M24 50h34M24 70h16" stroke="#00e676" stroke-width="10" stroke-linecap="round"/><circle cx="70" cy="70" r="7" fill="#38bdf8"/></svg>Forfunable
            </a>
            <a href="/" data-link class="btn-ghost btn-sm">${UI.icon('arrow_back', 'text-[16px]')} Explorar sin cuenta</a>
          </div>
          <div class="mb-6 grid grid-cols-2 rounded border border-line bg-surface-base p-1">
            <button id="tab-login" class="tab justify-center" ${UI.on('click', 'AuthView.setTab', 'login')}>Iniciar sesión</button>
            <button id="tab-register" class="tab justify-center" ${UI.on('click', 'AuthView.setTab', 'register')}>Crear cuenta</button>
          </div>
          <div id="auth-alert"></div>
          <div id="auth-form-container"></div>
        </section>
      </div>`;
    this.renderForm();
  },

  setTab(tab) {
    this.currentTab = tab;
    window.history.replaceState(null, '', tab === 'login' ? '/login' : '/register');
    document.getElementById('auth-alert').innerHTML = '';
    this.renderForm();
  },

  input(id, label, type, placeholder, autocomplete, icon) {
    return `
      <div class="mb-4">
        <label class="label" for="${id}">${label}</label>
        <div class="relative">
          ${UI.icon(icon, 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-muted')}
          <input type="${type}" id="${id}" class="input pl-10 ${type === 'password' ? 'pr-11' : ''}" placeholder="${placeholder}" autocomplete="${autocomplete}"
            ${UI.on('input', 'AuthView.validateField', id)} ${UI.on('blur', 'AuthView.validateField', id, true)}>
          ${type === 'password' ? `<button type="button" class="btn-icon absolute right-1 top-1/2 -translate-y-1/2" ${UI.on('click', 'AuthView.togglePassword', id, UI.EL)} aria-label="Mostrar contraseña">${UI.icon('visibility', 'text-[18px]')}</button>` : ''}
        </div>
        ${id === 'reg-password' ? '<ul class="mt-2 flex flex-col gap-0.5 text-body-sm text-ink-muted" id="reg-password-rules"></ul>' : `<div class="field-hint" id="${id}-hint"></div>`}
      </div>`;
  },

  togglePassword(id, btn) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.querySelector('.icon').textContent = input.type === 'password' ? 'visibility' : 'visibility_off';
  },

  renderForm() {
    ['login', 'register'].forEach(t => document.getElementById(`tab-${t}`).classList.toggle('active', t === this.currentTab));
    const box = document.getElementById('auth-form-container');
    if (this.currentTab === 'login') {
      box.innerHTML = `
        <h2 class="text-headline-lg">Bienvenido de nuevo</h2>
        <p class="mb-6 mt-1 text-body-md text-ink-secondary">Ingresa con tu correo y contraseña.</p>
        <form ${UI.on('submit', 'AuthView.handleLogin', UI.EVENT)} novalidate>
          ${this.input('login-email', 'Correo electrónico', 'email', 'nombre@correo.com', 'email', 'alternate_email')}
          ${this.input('login-password', 'Contraseña', 'password', 'Tu contraseña', 'current-password', 'key')}
          <button type="submit" class="btn-primary mt-2 w-full py-3" id="btn-auth-submit">${UI.icon('login', 'text-[19px]')} Entrar</button>
        </form>
        <p class="mt-6 rounded border border-line bg-surface-base px-4 py-3 text-body-sm text-ink-secondary">¿Aún no tienes cuenta? <button class="font-semibold text-primary hover:underline" ${UI.on('click', 'AuthView.setTab', 'register')}>Crea una gratis →</button></p>
        <p class="mt-4 flex items-center gap-1.5 text-body-sm text-ink-muted">${UI.icon('shield', 'text-[15px] text-primary')} Protegido por reCAPTCHA Enterprise y Cloud Armor</p>`;
    } else {
      box.innerHTML = `
        <h2 class="text-headline-lg">Crea tu cuenta</h2>
        <p class="mb-6 mt-1 text-body-md text-ink-secondary">Empiezas con 10 de karma; con 100 podrás fundar comunidades.</p>
        <form ${UI.on('submit', 'AuthView.handleRegister', UI.EVENT)} novalidate>
          ${this.input('reg-username', 'Nombre de usuario', 'text', 'tu_usuario', 'username', 'alternate_email')}
          ${this.input('reg-email', 'Correo electrónico', 'email', 'nombre@correo.com', 'email', 'mail')}
          ${this.input('reg-password', 'Contraseña', 'password', 'Crea una contraseña', 'new-password', 'key')}
          <p class="mb-4 text-body-sm text-ink-muted">Al registrarte aceptas las normas de convivencia de las comunidades.</p>
          <button type="submit" class="btn-primary w-full py-3" id="btn-auth-submit">${UI.icon('person_add', 'text-[19px]')} Crear cuenta</button>
        </form>
        <p class="mt-6 text-center text-body-sm text-ink-secondary">¿Ya tienes cuenta? <button class="font-semibold text-primary hover:underline" ${UI.on('click', 'AuthView.setTab', 'login')}>Inicia sesión</button></p>`;
      this.validateField('reg-password');
    }
  },

  // El aviso aparece al salir del campo o al enviar; luego se actualiza mientras escribes
  validateField(id, touched = false) {
    const input = document.getElementById(id);
    if (!input) return true;
    if (touched) input.dataset.touched = '1';
    const show = input.dataset.touched === '1';
    const value = id.endsWith('password') ? input.value : input.value.trim();

    if (id === 'reg-password') {
      const rules = this.validators.passwordRules(value);
      const valid = rules.every(r => r.ok);
      document.getElementById('reg-password-rules').innerHTML = rules.map(r => {
        const cls = r.ok ? 'text-primary' : (show ? 'text-danger' : '');
        return `<li class="flex items-center gap-1.5 ${cls}">${UI.icon(r.ok ? 'check_circle' : (show ? 'cancel' : 'radio_button_unchecked'), 'text-[15px]')}${r.text}</li>`;
      }).join('');
      input.classList.toggle('is-invalid', show && !valid);
      input.classList.toggle('is-valid', valid);
      return valid;
    }

    const validator = {
      'login-email': this.validators.email,
      'reg-email': this.validators.email,
      'reg-username': this.validators.username,
      'login-password': this.validators.loginPassword
    }[id];
    const error = validator(value);
    const hint = document.getElementById(`${id}-hint`);
    hint.innerHTML = show && error ? `${UI.icon('info', 'text-[15px]')}<span>${error}</span>` : '';
    input.classList.toggle('is-invalid', show && !!error);
    input.classList.toggle('is-valid', !error && id !== 'login-password');
    return !error;
  },

  validateAll(ids) {
    let firstInvalid = null;
    ids.forEach(id => { if (!this.validateField(id, true) && !firstInvalid) firstInvalid = id; });
    if (firstInvalid) document.getElementById(firstInvalid).focus();
    return !firstInvalid;
  },

  alert(html, tone = 'danger') {
    const cls = tone === 'warning' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-danger/30 bg-danger/10 text-danger';
    document.getElementById('auth-alert').innerHTML = `<div class="mb-5 flex items-start gap-2 rounded border px-4 py-3 text-body-sm ${cls}">${html}</div>`;
  },

  busy(on, label) {
    const btn = document.getElementById('btn-auth-submit');
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `${UI.icon('progress_activity', 'animate-spin text-[19px]')} ${label}`; }
    else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  },

  async handleLogin(e) {
    e.preventDefault();
    if (!this.validateAll(['login-email', 'login-password'])) return;
    this.busy(true, 'Verificando...');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await window.api.login(email, password);
      this.failedLogins = 0;
      window.utils.showToast(`¡Hola de nuevo, @${window.api.user.username}!`, 'info');
      let next = '/';
      try { next = sessionStorage.getItem('forfunable_after_login') || '/'; sessionStorage.removeItem('forfunable_after_login'); } catch (_) {}
      Router.navigate(next);
    } catch (err) {
      this.busy(false);
      if (window.StatusView && StatusView.handleAuthError(err, 'login')) return;
      this.failedLogins++;
      // 06_69 Credenciales incorrectas y bloqueo preventivo
      const left = Math.max(0, 5 - this.failedLogins);
      this.alert(`${UI.icon('error', 'text-[18px]')}<span><strong>${UI.esc(err.message || 'Credenciales incorrectas')}</strong>${this.failedLogins >= 3 ? `<br>Llevas ${this.failedLogins} intentos fallidos. ${left ? `Por seguridad te quedan ${left} antes de una pausa temporal.` : 'Espera unos minutos antes de volver a intentarlo.'}` : ''}</span>`, this.failedLogins >= 3 ? 'warning' : 'danger');
      if (this.failedLogins >= 5) StatusView.page('lockout', { replaceMain: false });
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    if (!this.validateAll(['reg-username', 'reg-email', 'reg-password'])) return;
    this.busy(true, 'Creando cuenta...');
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    try {
      await window.api.register(username, email, password);
      Router.navigate('/welcome');
    } catch (err) {
      this.busy(false);
      if (window.StatusView && StatusView.handleAuthError(err, 'register')) return;
      this.alert(`${UI.icon('error', 'text-[18px]')}<span>${UI.esc(err.message || 'No se pudo crear la cuenta')}</span>`);
    }
  },

  // 06_85 Identidad verificada y bienvenida a la red
  welcome() {
    const u = window.api.user;
    $main().innerHTML = `
      <div class="w-full max-w-xl text-center">
        <div class="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span class="absolute inset-0 animate-ping rounded-full bg-primary/10"></span>
          <span class="relative flex h-20 w-20 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">${UI.icon('verified', 'icon-fill text-[40px]')}</span>
        </div>
        <span class="chip-primary mt-6">Cuenta verificada</span>
        <h1 class="mt-3 text-headline-xl">Bienvenido a la red, @${UI.esc(u.username)}</h1>
        <p class="mx-auto mt-3 max-w-md text-body-lg text-ink-secondary">Tu identidad quedó registrada. Empiezas como <strong class="text-ink">${UI.rank(u.karma_score || 0).name}</strong> con ${u.karma_score || 0} puntos de karma.</p>
        <div class="card mt-8 grid grid-cols-3 divide-x divide-line text-left">
          ${[['arrow_upward', 'Vota', 'Destaca aportes de calidad'], ['edit_note', 'Publica', 'Abre debates técnicos'], ['groups', 'Únete', 'Sigue comunidades']].map(([i, t, d]) => `
            <div class="px-4"><span class="text-primary">${UI.icon(i)}</span><div class="mt-2 text-label-lg">${t}</div><div class="text-body-sm text-ink-muted">${d}</div></div>`).join('')}
        </div>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/onboarding" data-link class="btn-primary px-6 py-3">${UI.icon('rocket_launch', 'text-[19px]')} Configurar mi espacio</a>
          <a href="/" data-link class="btn-secondary px-6 py-3">Ir al feed</a>
        </div>
      </div>`;
  },

  // 01_01 Onboarding: elegir comunidades y completar el perfil
  async onboarding() {
    this.selected = new Set();
    $main().innerHTML = `
      <div class="w-full max-w-3xl">
        <div class="mb-6 flex items-center gap-3">
          <span class="chip-neutral font-mono">Paso 1 de 2</span>
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-card"><div id="onb-progress" class="h-full w-1/2 rounded-full bg-primary transition-all"></div></div>
        </div>
        <div id="onb-step"></div>
      </div>`;
    let comms = [];
    try { comms = (await window.api.listCommunities()).sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0)); } catch (_) {}
    this.onbComms = comms;
    this.onbStep1();
  },

  onbStep1() {
    const comms = this.onbComms;
    document.getElementById('onb-step').innerHTML = `
      <h1 class="text-headline-lg">Elige tus comunidades</h1>
      <p class="mt-1 text-body-md text-ink-secondary">Te unirás a las que selecciones y verás sus publicaciones en tu feed.</p>
      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        ${comms.length ? comms.map(c => `
          <button type="button" class="card card-hover flex items-start gap-3 text-left" data-comm="${UI.esc(c.id)}" ${UI.on('click', 'AuthView.toggleCommunity', UI.EL)}>
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary/10 text-secondary">${UI.icon('tag')}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-label-lg">c/${UI.esc(c.name)}</span>
              <span class="mt-0.5 line-clamp-2 block text-body-sm text-ink-secondary">${UI.esc(c.description || 'Comunidad de Forfunable')}</span>
              <span class="mt-1 block font-mono text-body-sm text-ink-muted">${c.subscribers_count || 0} miembros</span>
            </span>
            <span class="onb-check flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong text-primary-ink"></span>
          </button>`).join('') : `<p class="text-ink-secondary">Todavía no hay comunidades. Podrás crear una cuando tengas 100 de karma.</p>`}
      </div>
      <div class="mt-8 flex justify-between gap-3">
        <a href="/" data-link class="btn-ghost">Omitir</a>
        <button class="btn-primary px-6" id="onb-next" ${UI.on('click', 'AuthView.onbJoin')}>Continuar ${UI.icon('arrow_forward', 'text-[18px]')}</button>
      </div>`;
  },

  toggleCommunity(btn) {
    const id = btn.dataset.comm;
    const on = !this.selected.has(id);
    if (on) this.selected.add(id); else this.selected.delete(id);
    btn.classList.toggle('border-primary', on);
    const check = btn.querySelector('.onb-check');
    check.className = `onb-check flex h-5 w-5 shrink-0 items-center justify-center rounded ${on ? 'bg-primary' : 'border border-line-strong'} text-primary-ink`;
    check.innerHTML = on ? UI.icon('check', 'text-[16px]') : '';
  },

  async onbJoin() {
    const btn = document.getElementById('onb-next');
    btn.disabled = true;
    // El 409 (ya es miembro) no es un error para el onboarding
    await Promise.all([...this.selected].map(id => window.api.joinCommunity(id).catch(() => null)));
    Router.loadSidebarCommunities();
    document.getElementById('onb-progress').style.width = '100%';
    document.querySelector('#main-view-container .chip-neutral').textContent = 'Paso 2 de 2';
    const u = window.api.user;
    document.getElementById('onb-step').innerHTML = `
      <h1 class="text-headline-lg">Preséntate a la comunidad</h1>
      <p class="mt-1 text-body-md text-ink-secondary">Opcional: una biografía corta ayuda a que otros te conozcan.</p>
      <div class="card mt-6">
        ${UI.field('onb-bio', 'Biografía', { textarea: true, rows: 3, placeholder: 'Ej: Backend en Go, interesado en sistemas distribuidos', value: u.bio || '', attrs: 'maxlength="300"' })}
        <label class="label">Estado</label>
        <div class="grid grid-cols-3 gap-2" id="onb-status">
          ${[['ONLINE', 'En línea', 'bg-primary'], ['BUSY', 'Ocupado', 'bg-danger'], ['OFFLINE', 'Invisible', 'bg-ink-muted']].map(([v, l, c], i) => `
            <button type="button" data-status="${v}" class="btn-secondary justify-start ${i === 0 ? 'border-primary' : ''}" ${UI.on('click', 'AuthView.pickStatus', UI.EL)}><span class="h-2 w-2 rounded-full ${c}"></span>${l}</button>`).join('')}
        </div>
      </div>
      <div class="mt-8 flex justify-end gap-3">
        <a href="/" data-link class="btn-ghost">Omitir</a>
        <button class="btn-primary px-6" ${UI.on('click', 'AuthView.onbFinish', UI.EL)}>${UI.icon('check', 'text-[18px]')} Terminar</button>
      </div>`;
  },

  async onbFinish(btn) {
    btn.disabled = true;
    const bio = document.getElementById('onb-bio').value.trim();
    const status = document.querySelector('#onb-status .border-primary')?.dataset.status || 'ONLINE';
    try {
      if (bio) await window.api.updateProfile({ bio });
      await window.api.updateStatus(status);
      await window.api.getMe();
    } catch (err) {
      window.utils.showToast(err.message || 'No se pudo guardar el perfil', 'error');
    }
    window.utils.showToast('¡Todo listo! Este es tu feed', 'info');
    Router.navigate('/');
  }
};
