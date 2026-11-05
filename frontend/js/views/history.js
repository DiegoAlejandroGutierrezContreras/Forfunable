/**
 * 03_22 Historial de versiones de una publicación y comparación (diff) entre dos versiones.
 * Conectada a /api/v1/posts/:id/revisions. El autor puede restaurar una versión anterior.
 */

window.HistoryView = {
  data: null,
  a: 0,
  b: 0,
  mode: 'unified',

  async render(postId, query = {}) {
    $main().innerHTML = UI.skeletonPosts(2);
    let data, post;
    try {
      [data, post] = await Promise.all([window.api.listRevisions(postId), window.api.getPost(postId)]);
    } catch (err) {
      if (err.status === 404) return StatusView.page('404', { what: 'post' });
      if (err.error === 'FEATURE_UNAVAILABLE') {
        $main().innerHTML = UI.empty({ icon: 'construction', title: 'Historial no disponible', text: 'El servidor aún no tiene aplicada la migración V003.' });
        return;
      }
      throw err;
    }
    this.data = data;
    this.post = post;
    const n = data.items.length;
    // Por defecto: la versión anterior frente a la actual
    this.b = Math.min(n - 1, Math.max(0, Number(query.b ?? n - 1)));
    this.a = Math.min(this.b, Math.max(0, Number(query.a ?? Math.max(0, n - 2))));
    const link = `/posts/${encodeURIComponent(postId)}`;

    $main().innerHTML = `
      <nav class="mb-3 flex items-center gap-1.5 text-body-sm text-ink-muted">
        ${post.community_name ? `<a href="/c/${encodeURIComponent(post.community_name)}" data-link class="text-secondary hover:underline">c/${UI.esc(post.community_name)}</a>${UI.icon('chevron_right', 'text-[16px]')}` : ''}
        <a href="${link}" data-link class="truncate hover:text-ink">${UI.esc(post.title)}</a>${UI.icon('chevron_right', 'text-[16px]')}
        <span>Historial</span>
      </nav>
      ${UI.pageHeader('Historial de versiones', `${n} ${n === 1 ? 'versión' : 'versiones'} · ${data.edits} ${data.edits === 1 ? 'edición' : 'ediciones'}. El título no cambia; se registra el cuerpo de cada edición.`, `<a href="${link}" data-link class="btn-secondary">${UI.icon('arrow_back', 'text-[18px]')} Volver a la publicación</a>`, 'history')}
      <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside class="card h-fit p-2">
          <div class="flex items-center justify-between px-2 pb-2 pt-1 text-label-sm uppercase tracking-wider text-ink-muted"><span>Versiones</span><span>A · B</span></div>
          <ol id="history-list" class="flex flex-col gap-0.5"></ol>
        </aside>
        <section id="history-diff" class="min-w-0"></section>
      </div>`;
    this.paintList();
    this.paintDiff();
  },

  paintList() {
    const items = this.data.items;
    document.getElementById('history-list').innerHTML = items.map((v, i) => `
      <li class="flex items-start gap-3 rounded px-2 py-2.5 ${i === this.a || i === this.b ? 'bg-surface-elevated' : ''}">
        <span class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-label-sm ${v.current ? 'bg-primary/15 text-primary' : 'bg-surface-subtle text-ink-secondary'}">${i + 1}</span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5 text-label-lg">${i === 0 ? 'Original' : `Edición ${i}`}${v.current ? '<span class="chip-primary">Actual</span>' : ''}</div>
          <div class="text-body-sm text-ink-muted" title="${UI.esc(new Date(v.created_at).toLocaleString('es'))}">${window.utils.formatTime(v.created_at)}${v.editor_username ? ` · @${UI.esc(v.editor_username)}` : ''}</div>
          <div class="mt-0.5 font-mono text-label-sm text-ink-muted">${(v.body_text || '').length} caracteres</div>
        </div>
        <div class="flex shrink-0 gap-2 pt-1">
          <input type="radio" name="ver-a" aria-label="Comparar desde la versión ${i + 1}" class="h-4 w-4 accent-[#ff5252]" ${i === this.a ? 'checked' : ''} ${i >= this.b ? 'disabled' : ''} onchange="HistoryView.pick('a', ${i})">
          <input type="radio" name="ver-b" aria-label="Comparar hasta la versión ${i + 1}" class="h-4 w-4 accent-[#00e676]" ${i === this.b ? 'checked' : ''} ${i <= this.a && items.length > 1 ? 'disabled' : ''} onchange="HistoryView.pick('b', ${i})">
        </div>
      </li>`).join('');
  },

  pick(which, i) {
    this[which] = i;
    if (this.a >= this.b && this.data.items.length > 1) {
      if (which === 'a') this.b = Math.min(this.data.items.length - 1, i + 1); else this.a = Math.max(0, i - 1);
    }
    window.history.replaceState(null, '', `${window.location.pathname}?a=${this.a}&b=${this.b}`);
    this.paintList();
    this.paintDiff();
  },

  setMode(m) { this.mode = m; this.paintDiff(); },

  paintDiff() {
    const items = this.data.items;
    const box = document.getElementById('history-diff');
    if (items.length < 2) {
      box.innerHTML = `
        <div class="card">
          <div class="mb-3 flex items-center gap-2 text-label-lg">${UI.icon('description', 'text-secondary')} Versión original (sin ediciones)</div>
          <div class="prose-post text-body-md">${window.utils.renderMarkdown(items[0].body_text) || '<p class="text-ink-muted">Sin texto.</p>'}</div>
        </div>`;
      return;
    }
    const A = items[this.a], B = items[this.b];
    const ops = this.diff(A.body_text || '', B.body_text || '');
    const added = ops.filter(o => o.t === '+').length;
    const removed = ops.filter(o => o.t === '-').length;
    const me = window.api.user;
    const canRestore = me && me.id === this.post.author_id && !A.current;
    const label = i => i === 0 ? 'Original' : `Edición ${i}`;

    const unified = ops.map(o => `<div class="diff-line ${o.t === '+' ? 'diff-add' : o.t === '-' ? 'diff-del' : 'text-ink-secondary'}"><span class="mr-2 select-none text-ink-muted">${o.t === '=' ? ' ' : o.t}</span>${UI.esc(o.v) || '&nbsp;'}</div>`).join('');
    const side = (keep, cls) => ops.filter(o => o.t === '=' || o.t === keep).map(o => `<div class="diff-line ${o.t === keep ? cls : 'text-ink-secondary'}">${UI.esc(o.v) || '&nbsp;'}</div>`).join('');

    box.innerHTML = `
      <div class="card p-0">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div class="flex flex-wrap items-center gap-2 text-body-sm">
            <span class="chip-danger">${label(this.a)}</span>${UI.icon('arrow_forward', 'text-[16px] text-ink-muted')}<span class="chip-primary">${label(this.b)}</span>
            <span class="font-mono text-ink-muted"><span class="text-primary">+${added}</span> / <span class="text-danger">−${removed}</span> ${this.unit === 'word' ? 'palabras' : 'líneas'}</span>
          </div>
          <div class="flex items-center gap-1 rounded border border-line p-0.5">
            <button class="tab ${this.mode === 'unified' ? 'active' : ''}" onclick="HistoryView.setMode('unified')">Unificado</button>
            <button class="tab ${this.mode === 'split' ? 'active' : ''}" onclick="HistoryView.setMode('split')">Lado a lado</button>
          </div>
        </div>
        ${this.mode === 'unified'
          ? `<div class="max-h-[60vh] overflow-auto py-2">${unified}</div>`
          : `<div class="grid max-h-[60vh] overflow-auto md:grid-cols-2 md:divide-x md:divide-line">
              <div class="py-2"><div class="px-3 pb-1 text-label-sm uppercase tracking-wider text-ink-muted">${label(this.a)}</div>${side('-', 'diff-del')}</div>
              <div class="border-t border-line py-2 md:border-t-0"><div class="px-3 pb-1 text-label-sm uppercase tracking-wider text-ink-muted">${label(this.b)}</div>${side('+', 'diff-add')}</div>
            </div>`}
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-body-sm text-ink-muted">${UI.icon('info', 'text-[15px] align-[-3px]')} Rojo: texto retirado · Verde: texto añadido.</p>
        ${canRestore ? `<button class="btn-secondary" onclick="HistoryView.restore(${this.a})">${UI.icon('restore', 'text-[18px]')} Restaurar «${label(this.a)}»</button>` : ''}
      </div>`;
  },

  // Diff por líneas (LCS); si ambos textos tienen una sola línea, compara por palabras
  diff(a, b) {
    const oneLine = !a.includes('\n') && !b.includes('\n');
    this.unit = oneLine ? 'word' : 'line';
    const x = oneLine ? a.split(/(\s+)/).filter(Boolean) : a.split('\n');
    const y = oneLine ? b.split(/(\s+)/).filter(Boolean) : b.split('\n');
    const n = x.length, m = y.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { ops.push({ t: '=', v: x[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ t: '-', v: x[i++] });
      else ops.push({ t: '+', v: y[j++] });
    }
    while (i < n) ops.push({ t: '-', v: x[i++] });
    while (j < m) ops.push({ t: '+', v: y[j++] });
    if (oneLine) {
      // Agrupa palabras contiguas del mismo tipo en una sola línea legible
      const merged = [];
      ops.forEach(o => { const last = merged[merged.length - 1]; if (last && last.t === o.t) last.v += o.v; else merged.push({ ...o }); });
      return merged.filter(o => o.v.trim() || o.t === '=');
    }
    return ops;
  },

  async restore(i) {
    const v = this.data.items[i];
    const ok = await UI.confirm({ title: 'Restaurar versión', text: 'El contenido actual pasará al historial y esta versión será la nueva versión actual.', confirmText: 'Restaurar', icon: 'restore' });
    if (!ok) return;
    try {
      await window.api.updatePost(this.post.id, { body_text: UI.plain(v.body_text) });
      window.utils.showToast('Versión restaurada', 'info');
      this.render(this.post.id, {});
    } catch (err) { StatusView.toastError(err, 'No se pudo restaurar'); }
  }
};
