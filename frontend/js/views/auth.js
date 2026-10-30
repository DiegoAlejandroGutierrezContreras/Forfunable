/**
 * Vista: Autenticación y Registro Seguro (Pantalla Stitch 01-02 y 06-85)
 * Conectada a /api/v1/auth/login y /api/v1/auth/register
 */

window.AuthView = {
  currentTab: 'login',

  // Reglas de validación; deben coincidir con las del backend (models/dtos.go y Register)
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
    // Registro: lista de requisitos con lo que falta
    passwordRules(v) {
      return [
        { ok: v.length >= 8, text: 'Al menos 8 caracteres' },
        { ok: /[a-zA-Z]/.test(v), text: 'Al menos una letra' },
        { ok: /[0-9]/.test(v), text: 'Al menos un número' }
      ];
    }
  },

  render(container, defaultTab = 'login') {
    this.currentTab = defaultTab;

    container.innerHTML = `
      <div style="margin: 40px auto; width: 100%;" class="card card-elevated">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span class="brand-badge" style="font-size: 22px;">
              <span class="brand-dot"></span> Forfunable
            </span>
          </div>
          <p style="color: var(--text-secondary); font-size: 13px;">
            Plataforma de comunidades de alto rendimiento en GCP
          </p>
        </div>

        <!-- Selector de Tabs -->
        <div style="display: flex; border-bottom: 1px solid var(--border-subtle); margin-bottom: var(--space-lg);">
          <button class="btn btn-ghost" id="tab-login" style="flex: 1; border-radius: 0; border-bottom: 2px solid ${this.currentTab === 'login' ? 'var(--primary)' : 'transparent'}; color: ${this.currentTab === 'login' ? 'var(--text-primary)' : 'var(--text-muted)'};" onclick="AuthView.setTab('login')">
            Iniciar Sesión
          </button>
          <button class="btn btn-ghost" id="tab-register" style="flex: 1; border-radius: 0; border-bottom: 2px solid ${this.currentTab === 'register' ? 'var(--primary)' : 'transparent'}; color: ${this.currentTab === 'register' ? 'var(--text-primary)' : 'var(--text-muted)'};" onclick="AuthView.setTab('register')">
            Crear Cuenta
          </button>
        </div>

        <div id="auth-form-container"></div>

        <div style="text-align: center; margin-top: var(--space-md);">
          <a href="/" data-link style="font-size: 12px; color: var(--text-muted);">← Explorar Forfunable sin iniciar sesión</a>
        </div>
      </div>
    `;

    this.renderForm();
  },

  setTab(tab) {
    this.currentTab = tab;
    window.history.replaceState(null, null, tab === 'login' ? '/login' : '/register');
    document.getElementById('tab-login').style.borderBottomColor = tab === 'login' ? 'var(--primary)' : 'transparent';
    document.getElementById('tab-login').style.color = tab === 'login' ? 'var(--text-primary)' : 'var(--text-muted)';
    document.getElementById('tab-register').style.borderBottomColor = tab === 'register' ? 'var(--primary)' : 'transparent';
    document.getElementById('tab-register').style.color = tab === 'register' ? 'var(--text-primary)' : 'var(--text-muted)';
    this.renderForm();
  },

  // Campos vacíos (sin credenciales precargadas); el aviso aparece debajo de cada uno
  field(id, label, type, placeholder, autocomplete) {
    return `
      <div class="form-group">
        <label class="form-label" for="${id}">${label}</label>
        <input type="${type}" id="${id}" class="form-input" placeholder="${placeholder}" autocomplete="${autocomplete}"
          oninput="AuthView.validateField('${id}')" onblur="AuthView.validateField('${id}', true)">
        <div class="field-hint" id="${id}-hint"></div>
      </div>
    `;
  },

  renderForm() {
    const formContainer = document.getElementById('auth-form-container');
    if (this.currentTab === 'login') {
      formContainer.innerHTML = `
        <form onsubmit="AuthView.handleLogin(event)" novalidate>
          ${this.field('login-email', 'Correo Electrónico', 'email', 'nombre@correo.com', 'email')}
          ${this.field('login-password', 'Contraseña', 'password', 'Tu contraseña', 'current-password')}

          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: var(--space-md); display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--primary);">🛡️</span> Protegido por reCAPTCHA Enterprise & Cloud Armor
          </div>

          <button type="submit" class="btn btn-primary" id="btn-auth-submit" style="width: 100%; padding: 10px;">
            Ingresar al Ecosistema
          </button>
        </form>
      `;
    } else {
      formContainer.innerHTML = `
        <form onsubmit="AuthView.handleRegister(event)" novalidate>
          ${this.field('reg-username', 'Nombre de Usuario (@handle)', 'text', 'tu_usuario', 'username')}
          ${this.field('reg-email', 'Correo Electrónico', 'email', 'nombre@correo.com', 'email')}
          <div class="form-group">
            <label class="form-label" for="reg-password">Contraseña</label>
            <input type="password" id="reg-password" class="form-input" placeholder="Crea una contraseña" autocomplete="new-password"
              oninput="AuthView.validateField('reg-password')" onblur="AuthView.validateField('reg-password', true)">
            <ul class="password-rules" id="reg-password-rules">
              ${this.validators.passwordRules('').map(r => `<li>○ ${r.text}</li>`).join('')}
            </ul>
          </div>

          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: var(--space-md);">
            Al registrarte aceptas las directrices técnicas de gobernanza comunitaria.
          </div>

          <button type="submit" class="btn btn-primary" id="btn-auth-submit" style="width: 100%; padding: 10px;">
            Crear Cuenta Verificada
          </button>
        </form>
      `;
    }
  },

  // touched: el aviso se muestra al salir del campo o al enviar; después se actualiza mientras escribes
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
        const state = r.ok ? 'ok' : (show ? 'missing' : '');
        return `<li class="${state}">${r.ok ? '✓' : (show ? '✗' : '○')} ${r.text}</li>`;
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
    hint.innerHTML = show && error ? `<span>ⓘ</span><span>${error}</span>` : '';
    input.classList.toggle('is-invalid', show && !!error);
    input.classList.toggle('is-valid', !error && id !== 'login-password');
    return !error;
  },

  // Valida todos los campos al enviar y lleva el foco al primero con error
  validateAll(ids) {
    let firstInvalid = null;
    ids.forEach(id => {
      if (!this.validateField(id, true) && !firstInvalid) firstInvalid = id;
    });
    if (firstInvalid) document.getElementById(firstInvalid).focus();
    return !firstInvalid;
  },

  async handleLogin(e) {
    e.preventDefault();
    if (!this.validateAll(['login-email', 'login-password'])) return;

    const btn = document.getElementById('btn-auth-submit');
    btn.disabled = true;
    btn.textContent = 'Autenticando...';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      await window.api.login(email, password);
      window.utils.showToast('¡Sesión iniciada correctamente!', 'info');
      Router.navigate('/');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Ingresar al Ecosistema';
      window.utils.showToast(err.message || 'Credenciales incorrectas', 'error');
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    if (!this.validateAll(['reg-username', 'reg-email', 'reg-password'])) return;

    const btn = document.getElementById('btn-auth-submit');
    btn.disabled = true;
    btn.textContent = 'Generando cuenta...';

    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    try {
      await window.api.register(username, email, password);
      window.utils.showToast('¡Cuenta creada y autenticada!', 'info');
      Router.navigate('/');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Crear Cuenta Verificada';
      window.utils.showToast(err.message || 'Error en el registro', 'error');
    }
  }
};
