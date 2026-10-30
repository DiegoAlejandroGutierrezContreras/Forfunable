/**
 * 02_14 Feed principal: Para ti (Hot Ranking), Nuevo y Top, con barra rápida de publicación.
 * Conectada a GET /api/v1/posts?sort=hot|newest|top (público; con sesión incluye user_vote).
 */

window.FeedView = {
  activeFilter: 'hot',
  filters: [
    { id: 'hot', label: 'Para ti', icon: 'auto_awesome', hint: 'Votos atenuados por antigüedad (Hot Ranking)' },
    { id: 'new', label: 'Nuevo', icon: 'schedule', hint: 'Lo más reciente primero' },
    { id: 'top', label: 'Top', icon: 'trending_up', hint: 'Las publicaciones más votadas' }
  ],

  sortParam(filter = this.activeFilter) {
    return { hot: 'hot', new: 'newest', top: 'top' }[filter] || 'hot';
  },

  render() {
    const u = window.api.user;
    $main().innerHTML = `
      <div class="flex flex-col gap-4">
        <div id="feed-tabs"></div>
        ${u ? `
          <div class="card flex flex-col gap-3">
            <form class="flex items-center gap-3" onsubmit="event.preventDefault(); Router.navigate('/submit?title=' + encodeURIComponent(this.t.value.trim()))">
              ${UI.avatar(u, 40)}
              <input name="t" class="input flex-1" placeholder="Comparte una idea, discusión técnica o proyecto..." autocomplete="off">
            </form>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex gap-1">
                <a href="/submit?type=IMAGE" data-link class="btn-ghost btn-sm">${UI.icon('image', 'text-[18px]')} Imagen</a>
                <a href="/submit?code=1" data-link class="btn-ghost btn-sm">${UI.icon('code_blocks', 'text-[18px]')} Código</a>
                <a href="/submit?type=LINK" data-link class="btn-ghost btn-sm">${UI.icon('link', 'text-[18px]')} Enlace</a>
              </div>
              <a href="/submit" data-link class="btn-primary btn-sm">Publicar</a>
            </div>
          </div>` : ''}
        <div id="feed-content" class="flex flex-col gap-4"></div>
      </div>`;
    this.paintTabs();
    this.load();
  },

  paintTabs() {
    const f = this.filters.find(x => x.id === this.activeFilter);
    document.getElementById('feed-tabs').innerHTML = `
      <div class="flex items-center justify-between gap-3">
        ${UI.tabs(this.filters, this.activeFilter, 'FeedView.setFilter')}
        <span class="hidden text-body-sm text-ink-muted md:block">${UI.esc(f.hint)}</span>
      </div>`;
  },

  setFilter(filter) {
    this.activeFilter = filter;
    this.paintTabs();
    this.load();
  },

  async load() {
    const box = document.getElementById('feed-content');
    box.innerHTML = UI.skeletonPosts(3);
    try {
      const posts = await window.api.listPosts({ sort: this.sortParam(), limit: 30 });
      box.innerHTML = posts.length
        ? posts.map(p => UI.postCard(p)).join('')
        : UI.empty({
          icon: 'forum', title: 'Aún no hay publicaciones',
          text: 'Sé el primero en abrir un debate técnico.',
          action: `<a href="/submit" data-link class="btn-primary">Crear publicación</a><a href="/communities" data-link class="btn-secondary">Explorar comunidades</a>`
        });
    } catch (err) {
      box.innerHTML = UI.error(err, 'FeedView.load()');
    }
  },

  // Lista de publicaciones de una comunidad (02_12), con los mismos filtros
  async renderCommunity(container, community, filter = this.activeFilter) {
    this.communityFilter = filter;
    this.community = community;
    container.innerHTML = `
      <div class="mb-4">${UI.tabs(this.filters, filter, 'FeedView.setCommunityFilter')}</div>
      <div id="community-posts" class="flex flex-col gap-4">${UI.skeletonPosts(2)}</div>`;
    const box = document.getElementById('community-posts');
    try {
      const posts = await window.api.listPosts({ community_id: community.id, sort: this.sortParam(filter), limit: 50 });
      box.innerHTML = posts.length
        ? posts.map(p => UI.postCard(p)).join('')
        : UI.empty({
          icon: 'edit_note', title: 'Aún no hay publicaciones',
          text: `Inicia el primer debate en c/${UI.esc(community.name)}.`,
          action: `<a href="/submit?community=${encodeURIComponent(community.id)}" data-link class="btn-primary">Crear publicación</a>`
        });
    } catch (err) {
      box.innerHTML = UI.error(err, 'FeedView.setCommunityFilter(FeedView.communityFilter)');
    }
  },

  setCommunityFilter(filter) {
    const container = document.getElementById('community-feed');
    if (container) this.renderCommunity(container, this.community, filter);
  }
};
