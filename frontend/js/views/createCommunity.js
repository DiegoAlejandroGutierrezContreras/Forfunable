/**
 * 02_13 Crear comunidad y validación de karma (mínimo 100, salvo administradores globales).
 * Conectada a POST /api/v1/communities.
 */

window.CreateCommunityView = {
  MIN_KARMA: 100,

  render() {
    const u = window.api.user;
    const karma = u.karma_score || 0;
    const allowed = karma >= this.MIN_KARMA || u.global_role === 'GLOBAL_ADMIN';
    const pct = Math.min(100, Math.round((karma / this.MIN_KARMA) * 100));
    $main().innerHTML = `
      ${UI.pageHeader('Fundar una comunidad', 'Las comunidades son espacios autónomos gobernados por sus moderadores bajo las normas de la plataforma.', '', 'add_business')}

      <div class="card mb-4 flex flex-wrap items-center gap-4 ${allowed ? 'border-primary/30' : 'border-warning/40'}">
        <span class="flex h-12 w-12 items-center justify-center rounded-full ${allowed ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}">${UI.icon(allowed ? 'verified' : 'hourglass_top', 'text-[26px]')}</span>
        <div class="min-w-0 flex-1">
          <div class="text-headline-sm ${allowed ? 'text-primary' : 'text-warning'}">${allowed ? 'Requisito de karma cumplido' : 'Aún no tienes suficiente karma'}</div>
          <p class="text-body-sm text-ink-secondary">${u.global_role === 'GLOBAL_ADMIN' && karma < this.MIN_KARMA ? 'Como administrador global no necesitas el mínimo.' : `Tu karma: <strong class="text-ink">${karma}</strong> · mínimo exigido: ${this.MIN_KARMA}.`}${!allowed ? ` Te faltan ${this.MIN_KARMA - karma} puntos: publica y comenta para que otros voten tus aportes.` : ''}</p>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-base"><div class="h-full rounded-full ${allowed ? 'bg-primary' : 'bg-warning'}" style="width:${pct}%"></div></div>
        </div>
        <span class="font-display text-headline-lg ${allowed ? 'text-primary' : 'text-warning'}">${karma}/${this.MIN_KARMA}</span>
      </div>

      <form class="card p-5 sm:p-6 ${allowed ? '' : 'pointer-events-none opacity-50'}" onsubmit="CreateCommunityView.submit(event)" novalidate>
        <label class="label" for="comm-name">Nombre de la comunidad <span class="text-primary">*</span></label>
        <div class="flex">
          <span class="flex items-center rounded-l border border-r-0 border-line bg-surface-elevated px-3 font-mono text-ink-muted">c/</span>
          <input id="comm-name" class="input rounded-l-none" maxlength="24" placeholder="react-internals" autocomplete="off" oninput="CreateCommunityView.validate()">
        </div>
        <div class="field-hint" id="comm-name-hint"></div>
        <p class="help" id="comm-name-help">Entre 3 y 24 caracteres: letras, números, guiones o guiones bajos. No se puede cambiar después.</p>

        <div class="mt-4">${UI.field('comm-desc', 'Descripción', { textarea: true, rows: 3, placeholder: '¿De qué trata la comunidad y a quién va dirigida?', attrs: 'maxlength="500"' })}</div>
        ${UI.field('comm-rules', 'Reglas y código de conducta', { textarea: true, rows: 4, placeholder: '1. Respeto mutuo y crítica constructiva\n2. Incluye código reproducible\n3. Sin spam ni autopromoción', help: 'Una regla por línea. Aparecerán numeradas en la comunidad.' })}

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p class="text-body-sm text-ink-muted">Quedarás como fundador y primer miembro.</p>
          <div class="flex gap-2">
            <a href="/communities" data-link class="btn-ghost">Cancelar</a>
            <button type="submit" class="btn-primary px-5" id="btn-create-comm" ${allowed ? '' : 'disabled'}>${UI.icon('rocket_launch', 'text-[18px]')} Fundar comunidad</button>
          </div>
        </div>
      </form>`;
    Router.setRail(`
      <div class="card">
        <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon('lightbulb', 'text-warning')} Buenas prácticas</h3>
        <ul class="mt-3 flex flex-col gap-2 text-body-sm text-ink-secondary">
          <li>• Un nombre corto y específico se encuentra más fácil.</li>
          <li>• Explica en la descripción qué tipo de debates esperas.</li>
          <li>• Pocas reglas claras funcionan mejor que muchas.</li>
        </ul>
      </div>`);
  },

  validate(touched = true) {
    const v = document.getElementById('comm-name').value.trim();
    let msg = '';
    if (!v) msg = 'Escribe un nombre.';
    else if (/\s/.test(v)) msg = 'Sin espacios: usa guiones (ej: mi-comunidad).';
    else if (!/^[a-zA-Z0-9_-]+$/.test(v)) msg = 'Solo letras, números, guiones (-) y guiones bajos (_).';
    else if (v.length < 3) msg = `Te faltan ${3 - v.length} caracteres: mínimo 3.`;
    if (!touched) return !msg;
    return UI.setHint('comm-name', msg);
  },

  async submit(e) {
    e.preventDefault();
    if (!this.validate()) return document.getElementById('comm-name').focus();
    const btn = document.getElementById('btn-create-comm');
    btn.disabled = true;
    const name = document.getElementById('comm-name').value.trim();
    try {
      await window.api.createCommunity({
        name,
        description: document.getElementById('comm-desc').value.trim(),
        rules_text: document.getElementById('comm-rules').value.trim()
      });
      window.utils.showToast(`¡c/${name} está en línea!`, 'info');
      Router.loadSidebarCommunities();
      Router.navigate(`/c/${encodeURIComponent(name)}`);
    } catch (err) {
      btn.disabled = false;
      if (err.status === 409) return UI.setHint('comm-name', 'Ya existe una comunidad con ese nombre.');
      StatusView.toastError(err, 'No se pudo crear la comunidad');
    }
  }
};
