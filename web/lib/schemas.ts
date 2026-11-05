// Esquemas Zod de los payloads que el cliente envía a la API (directriz de validación declarativa).
// Replican los límites de models/*.go (binding) y de la base de datos; el backend vuelve a validar.
import { z } from 'zod';

// Mensajes por defecto en español para los casos sin mensaje propio
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor no permitido. Opciones: ${issue.options.join(', ')}.` };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Campos no permitidos: ${issue.keys.join(', ')}.` };
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Falta un dato obligatorio.' : 'Tipo de dato no válido.' };
    case z.ZodIssueCode.invalid_union:
    case z.ZodIssueCode.invalid_literal:
      return { message: 'Valor no válido.' };
    default:
      return { message: ctx.defaultError };
  }
});

const id = z.string().trim().min(1, 'Falta el identificador.').max(64, 'Identificador inválido.');
const httpsUrl = z
  .string()
  .trim()
  .url('El enlace no es válido.')
  .refine((v) => /^https?:\/\//i.test(v), 'El enlace debe empezar por https://');

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'El nombre de usuario necesita al menos 3 caracteres.')
  .max(30, 'El nombre de usuario admite máximo 30 caracteres.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Usuario: solo letras, números y guion bajo (_).');

export const EmailSchema = z.string().trim().max(254).email('El correo electrónico no es válido.');

export const NewPasswordSchema = z
  .string()
  .min(8, 'La contraseña necesita al menos 8 caracteres.')
  .max(128, 'La contraseña admite máximo 128 caracteres.')
  .regex(/[a-zA-Z]/, 'La contraseña necesita al menos una letra.')
  .regex(/[0-9]/, 'La contraseña necesita al menos un número.');

const recaptchaToken = z.string().max(4096).optional();

export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1, 'Escribe tu contraseña.').max(128),
    recaptcha_token: recaptchaToken,
  })
  .strict();

export const RegisterSchema = z
  .object({
    username: UsernameSchema,
    email: EmailSchema,
    password: NewPasswordSchema,
    recaptcha_token: recaptchaToken,
  })
  .strict();

export const PostCreateSchema = z
  .object({
    community_id: id,
    title: z.string().trim().min(3, 'El título necesita al menos 3 caracteres.').max(300, 'El título admite máximo 300 caracteres.'),
    content_type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'LINK']),
    body_text: z.string().max(40000, 'El contenido admite máximo 40000 caracteres.').optional(),
    media_url: z.union([httpsUrl, z.literal('')]).optional(),
    flair_id: z.union([id, z.literal('')]).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.content_type === 'TEXT' && !(p.body_text ?? '').trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body_text'], message: 'Escribe el contenido de la publicación.' });
    }
    if (p.content_type !== 'TEXT' && !p.media_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['media_url'], message: 'Añade el enlace del contenido.' });
    }
  });

export const CommentCreateSchema = z
  .object({
    post_id: id,
    parent_comment_id: z.union([id, z.null()]).optional(),
    content: z.string().trim().min(1, 'Escribe un comentario.').max(5000, 'El comentario admite máximo 5000 caracteres.'),
  })
  .strict();

export const ReportCreateSchema = z
  .object({
    target_id: id,
    target_type: z.enum(['POST', 'COMMENT', 'USER', 'CHAT_MESSAGE']),
    reason_code: z.string().trim().min(1, 'Elige un motivo.').max(50),
    description: z.string().trim().max(1000, 'La descripción admite máximo 1000 caracteres.').optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type PostCreateInput = z.infer<typeof PostCreateSchema>;
export type CommentCreateInput = z.infer<typeof CommentCreateSchema>;
export type ReportCreateInput = z.infer<typeof ReportCreateSchema>;
