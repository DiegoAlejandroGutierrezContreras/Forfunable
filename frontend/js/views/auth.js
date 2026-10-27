/**
 * Vista: Autenticación y Registro Seguro (Pantalla Stitch 01-02 y 06-85)
 * Conectada a /api/v1/auth/login y /api/v1/auth/register
 */

window.AuthView = {
  currentTab: 'login',

  render(container, defaultTab = 'login') {
    this.currentTab = defaultTab;

    container.innerHTML = `
      <div style="max-width: 440px; margin: 40px auto;" class="card card-elevated">
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
      </div>
    `;

    this.renderForm();
  },

  setTab(tab) {
    this.currentTab = tab;
    document.getElementById('tab-login').style.borderBottomColor = tab === 'login' ? 'var(--primary)' : 'transparent';
    document.getElementById('tab-login').style.color = tab === 'login' ? 'var(--text-primary)' : 'var(--text-muted)';
    document.getElementById('tab-register').style.borderBottomColor = tab === 'register' ? 'var(--primary)' : 'transparent';
    document.getElementById('tab-register').style.color = tab === 'register' ? 'var(--text-primary)' : 'var(--text-muted)';
    this.renderForm();
  },

  renderForm() {
    const formContainer = document.getElementById('auth-form-container');
    if (this.currentTab === 'login') {
      formContainer.innerHTML = `
        <form onsubmit="AuthView.handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Correo Electrónico</label>
            <input type="email" id="login-email" class="form-input" required placeholder="tu_correo@ejemplo.com" value="ricardo@example.com">
          </div>

          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input type="password" id="login-password" class="form-input" required placeholder="••••••••" value="Password123!">
          </div>

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
        <form onsubmit="AuthView.handleRegister(event)">
          <div class="form-group">
            <label class="form-label">Nombre de Usuario (@handle)</label>
            <input type="text" id="reg-username" class="form-input" required placeholder="kiba_dev" pattern="^[a-zA-Z0-9_]{3,20}$">
          </div>

          <div class="form-group">
            <label class="form-label">Correo Electrónico</label>
            <input type="email" id="reg-email" class="form-input" required placeholder="tu_correo@ejemplo.com">
          </div>

          <div class="form-group">
            <label class="form-label">Contraseña (Mínimo 8 caracteres)</label>
            <input type="password" id="reg-password" class="form-input" required placeholder="Password123!" minlength="8">
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

  async handleLogin(e) {
    e.preventDefault();
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
