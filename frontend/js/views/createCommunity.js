/**
 * Vista: Crear Comunidad y Validación de Karma (Pantalla Stitch 02-13)
 * Restricción obligatoria de negocio: karma_score >= 100
 */

window.CreateCommunityView = {
  render(container) {
    if (!window.api.user) {
      container.innerHTML = `
        <div class="state-empty card">
          <h3>Autenticación Requerida</h3>
          <p>Debes iniciar sesión con una cuenta activa para crear comunidades.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/login')">Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    const userKarma = window.api.user.karma_score || 0;
    const canCreate = userKarma >= 100 || window.api.user.role === 'GLOBAL_ADMIN';

    container.innerHTML = `
      <div class="card" style="max-width: 680px; margin: 0 auto;">
        <h1 style="margin-bottom: 6px;">🏛️ Fundar una Nueva Comunidad</h1>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-lg); font-size: 14px;">
          Las comunidades son espacios autónomos gobernados por sus creadores bajo las reglas de la plataforma.
        </p>

        <!-- Banner de Validación de Karma -->
        <div style="background-color: ${canCreate ? 'var(--primary-tint)' : 'var(--error-tint)'}; border: 1px solid ${canCreate ? 'var(--primary)' : 'var(--error)'}; border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: var(--space-lg); display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; color: ${canCreate ? 'var(--primary)' : 'var(--error)'};">
              ${canCreate ? '✓ Requisito de Karma Cumplido' : '⚠️ Requisito de Karma Insuficiente'}
            </div>
            <div style="font-size: 13px; color: var(--text-primary); margin-top: 2px;">
              Tu Karma actual: <strong>${userKarma}</strong> puntos (mínimo exigido: 100 puntos).
            </div>
          </div>
          <span class="karma-counter" style="font-size: 20px; color: ${canCreate ? 'var(--primary)' : 'var(--error)'};">
            ${userKarma}/100
          </span>
        </div>

        ${!canCreate ? `
          <div class="state-error" style="border: none; background: transparent; padding: var(--space-sm);">
            <p>Para prevenir spam y granjas de bots, se requiere acumular al menos 100 puntos de karma participando en debates existentes antes de fundar un nuevo foro.</p>
            <button class="btn btn-secondary" onclick="Router.navigate('/')">Explorar debates y ganar karma</button>
          </div>
        ` : `
          <form id="create-community-form" onsubmit="CreateCommunityView.handleSubmit(event)">
            <div class="form-group">
              <label class="form-label">Nombre del Canal (URL y menciones)</label>
              <div style="display: flex; align-items: center;">
                <span style="background: var(--surface-subtle); padding: 10px 14px; border: 1px solid var(--border-subtle); border-right: none; border-radius: var(--radius-md) 0 0 var(--radius-md); color: var(--text-muted); font-family: var(--font-mono);">c/</span>
                <input type="text" id="comm-name" class="form-input" style="border-radius: 0 var(--radius-md) var(--radius-md) 0;" required placeholder="ej: react-internals" pattern="[a-zA-Z0-9_\\-]{3,24}" title="Entre 3 y 24 caracteres: letras, números, guiones o guiones bajos, sin espacios">
              </div>
              <span style="font-size: 11px; color: var(--text-muted);">Entre 3 y 24 caracteres. Solo letras, números y guiones.</span>
            </div>

            <div class="form-group">
              <label class="form-label">Título Descriptivo</label>
              <input type="text" id="comm-title" class="form-input" required placeholder="ej: React Architecture & Deep Dives">
            </div>

            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea id="comm-desc" class="form-textarea" rows="3" required placeholder="¿Cuál es el foco técnico de esta comunidad?"></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Reglas y Directrices de Gobernanza</label>
              <textarea id="comm-rules" class="form-textarea" rows="3" placeholder="1. Todo código debe incluir benchmarks.\n2. No ataques personales."></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: var(--space-lg);">
              <button type="button" class="btn btn-ghost" onclick="Router.navigate('/')">Cancelar</button>
              <button type="submit" class="btn btn-primary" id="btn-submit-comm">Fundar Comunidad</button>
            </div>
          </form>
        `}
      </div>
    `;
  },

  async handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-comm');
    btn.disabled = true;
    btn.textContent = 'Verificando con Cloud SQL...';

    const payload = {
      name: document.getElementById('comm-name').value.trim(),
      title: document.getElementById('comm-title').value.trim(),
      description: document.getElementById('comm-desc').value.trim(),
      rules_text: document.getElementById('comm-rules').value.trim()
    };

    try {
      const res = await window.api.createCommunity(payload);
      window.utils.showToast(`¡Comunidad c/${payload.name} creada con éxito!`, 'info');
      Router.navigate(`/c/${payload.name}`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Fundar Comunidad';
      window.utils.showToast(err.message || 'Error al crear comunidad', 'error');
    }
  }
};
