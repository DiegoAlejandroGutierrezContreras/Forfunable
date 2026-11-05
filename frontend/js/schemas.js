/**
 * Esquemas de validación (Zod) de todo lo que el SPA envía a la API.
 * api.js valida cada payload con estos esquemas ANTES del fetch; el backend vuelve a validar.
 * Los límites replican los de models/*.go (binding) y los CHECK de la base de datos.
 */
(function () {
  const { z } = window.Zod;

  // Mensajes por defecto en español para los casos sin mensaje propio
  z.setErrorMap((issue, ctx) => {
    switch (issue.code) {
      case 'invalid_enum_value': return { message: `Valor no permitido. Opciones: ${issue.options.join(', ')}.` };
      case 'unrecognized_keys': return { message: `Campos no permitidos: ${issue.keys.join(', ')}.` };
      case 'invalid_type': return { message: issue.received === 'undefined' ? 'Falta un dato obligatorio.' : 'Tipo de dato no válido.' };
      case 'invalid_union': case 'invalid_literal': return { message: 'Valor no válido.' };
      default: return { message: ctx.defaultError };
    }
  });

  const id = z.string().trim().min(1, 'Falta el identificador.').max(64, 'Identificador inválido.');
  const optionalId = z.union([id, z.literal(''), z.null()]).optional();
  const httpsUrl = z.string().trim().url('El enlace no es válido.').refine(v => /^https?:\/\//i.test(v), 'El enlace debe empezar por https://');
  const optionalUrl = z.union([httpsUrl, z.literal('')]).optional();
  const text = (min, max, what) => z.string().trim()
    .min(min, min <= 1 ? `Escribe ${what}.` : `${what[0].toUpperCase() + what.slice(1)}: mínimo ${min} caracteres.`)
    .max(max, `${what[0].toUpperCase() + what.slice(1)}: máximo ${max} caracteres.`);
  const optionalText = max => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional();

  const username = z.string().trim()
    .min(3, 'El nombre de usuario necesita al menos 3 caracteres.')
    .max(30, 'El nombre de usuario admite máximo 30 caracteres.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Usuario: solo letras, números y guion bajo (_).');
  const email = z.string().trim().max(254, 'Correo demasiado largo.').email('El correo electrónico no es válido.');
  const newPassword = z.string()
    .min(8, 'La contraseña necesita al menos 8 caracteres.')
    .max(128, 'La contraseña admite máximo 128 caracteres.')
    .regex(/[a-zA-Z]/, 'La contraseña necesita al menos una letra.')
    .regex(/[0-9]/, 'La contraseña necesita al menos un número.');
  const recaptcha = z.string().max(4096).optional();

  const S = {
    register: z.object({ username, email, password: newPassword, recaptcha_token: recaptcha }).strict(),
    login: z.object({ email, password: z.string().min(1, 'Escribe tu contraseña.').max(128), recaptcha_token: recaptcha }).strict(),
    changePassword: z.object({ current_password: z.string().min(1, 'Escribe tu contraseña actual.'), new_password: newPassword }).strict(),
    updateProfile: z.object({
      username: username.optional(),
      email: email.optional(),
      avatar_url: optionalUrl,
      bio: optionalText(300)
    }).strict(),
    updateStatus: z.object({ presence_status: z.enum(['ONLINE', 'BUSY', 'OFFLINE']) }).strict(),

    createCommunity: z.object({
      name: z.string().trim().min(3, 'El nombre necesita al menos 3 caracteres.').max(50, 'Máximo 50 caracteres.')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Nombre: solo letras, números, guiones (-) y guiones bajos (_).'),
      description: optionalText(500),
      rules_text: optionalText(5000),
      is_private: z.boolean().optional(),
      age_restricted: z.boolean().optional(),
      recaptcha_token: recaptcha
    }).strict(),
    communitySettings: z.object({ rules_text: z.string().max(5000, 'Reglas: máximo 5000 caracteres.'), is_private: z.boolean(), age_restricted: z.boolean() }).strict(),

    createPost: z.object({
      community_id: id,
      title: text(3, 300, 'el título'),
      content_type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'LINK']),
      body_text: z.string().max(40000, 'El contenido admite máximo 40000 caracteres.').optional(),
      media_url: optionalUrl,
      flair_id: optionalId
    }).strict().superRefine((p, ctx) => {
      if (p.content_type === 'TEXT' && !(p.body_text || '').trim()) ctx.addIssue({ code: 'custom', path: ['body_text'], message: 'Escribe el contenido de la publicación.' });
      if (p.content_type !== 'TEXT' && !p.media_url) ctx.addIssue({ code: 'custom', path: ['media_url'], message: 'Añade el enlace del contenido.' });
    }),
    updatePost: z.object({ body_text: z.string().trim().min(1, 'El contenido no puede quedar vacío.').max(40000) }).strict(),

    createComment: z.object({ post_id: id, parent_comment_id: optionalId, content: text(1, 5000, 'un comentario') }).strict(),
    updateComment: z.object({ content: text(1, 5000, 'un comentario') }).strict(),
    vote: z.object({ vote_value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).strict(),

    report: z.object({
      target_id: id,
      target_type: z.enum(['POST', 'COMMENT', 'USER', 'CHAT_MESSAGE']),
      reason_code: z.string().trim().min(1, 'Elige un motivo.').max(50),
      description: optionalText(1000)
    }).strict(),
    communityNote: z.object({ post_id: id, note_text: text(5, 1000, 'la nota'), proof_url: optionalUrl }).strict(),

    chatRequest: z.object({ recipient_user_id: id, initial_message: text(1, 500, 'un mensaje') }).strict(),
    chatAction: z.object({ action: z.enum(['ACCEPT', 'REJECT', 'BLOCK']) }).strict(),
    verifyAge: z.object({ idp_assertion_token: z.string().trim().min(1).max(200) }).strict(),
    notificationSettings: z.object({
      email_on_reply: z.boolean().optional(), email_on_mention: z.boolean().optional(),
      push_on_chat_request: z.boolean().optional(), push_on_community_update: z.boolean().optional()
    }).strict(),
    noteVote: z.object({ is_helpful: z.boolean() }).strict(),
    reindex: z.object({}).passthrough(),
    chatMessage: z.object({ message_text: text(1, 2000, 'un mensaje') }).strict(),

    save: z.object({ collection_id: optionalId, note: optionalText(500) }).strict(),
    collection: z.object({ name: text(1, 60, 'un nombre'), description: optionalText(200) }).strict(),
    deleteAccount: z.object({ password: z.string().min(1, 'Escribe tu contraseña.'), confirm_username: z.string().trim().min(1, 'Escribe tu nombre de usuario.'), reason: optionalText(200) }).strict(),
    accessRequest: z.object({ message: optionalText(500) }).strict(),
    accessDecision: z.object({ action: z.enum(['APPROVE', 'REJECT']), note: optionalText(500) }).strict(),
    appeal: z.object({ kind: z.enum(['COMMUNITY_BAN', 'CONTENT_REMOVAL']), reference_id: z.string().trim().min(1).max(200), message: text(10, 2000, 'la apelación') }).strict(),
    appealDecision: z.object({ decision: z.enum(['ACCEPT', 'REJECT']), resolution: text(5, 2000, 'la resolución') }).strict(),
    flair: z.object({
      name: text(1, 30, 'un nombre'),
      color: z.enum(['primary', 'secondary', 'tertiary', 'warning', 'danger', 'neutral']),
      description: optionalText(120),
      mod_only: z.boolean(),
      position: z.number().int().min(0).max(1000)
    }).strict(),
    postFlair: z.object({ flair_id: z.union([id, z.literal('')]) }).strict(),
    transfer: z.object({ new_owner: username, confirm_name: z.string().trim().min(1, 'Confirma el nombre de la comunidad.') }).strict(),

    ban: z.object({ user_id: id, community_id: id, reason: text(3, 500, 'el motivo'), duration_days: z.number().int().min(0).max(3650) }).strict(),
    unban: z.object({ user_id: id, community_id: id, reason: optionalText(500) }).strict(),
    assignModerator: z.object({ user_id: id, role: z.enum(['OWNER', 'LEAD_MOD', 'MOD']) }).strict(),
    userRole: z.object({ global_role: z.enum(['USER', 'COMMUNITY_MOD', 'GLOBAL_ADMIN']) }).strict(),
    userStatus: z.object({ is_active: z.boolean(), freeze_reason: optionalText(500) }).strict(),
    resolveReport: z.object({ status: z.enum(['PENDING', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED']) }).strict()
  };

  // Valida y devuelve los datos normalizados; si fallan, lanza un error con la misma forma que los del backend
  window.Schemas = S;
  window.validatePayload = function (name, data) {
    const schema = S[name];
    if (!schema) throw new Error(`Esquema desconocido: ${name}`);
    const res = schema.safeParse(data);
    if (res.success) return res.data;
    const issue = res.error.issues[0];
    throw {
      error: 'VALIDATION_ERROR',
      status: 400,
      field: issue.path.join('.'),
      message: issue.message,
      issues: res.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
    };
  };
})();
