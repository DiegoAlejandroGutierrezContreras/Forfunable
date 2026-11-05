// Cliente HTTP de Forfunable (UX_MAPPING.md §3 y §4).
// - Rutas relativas: next.config.js reenvía /api/* al backend en Cloud Run (same-origin).
// - access_token solo en memoria; nunca en localStorage/sessionStorage.
// - X-CSRF-Token se copia de la cookie csrf_token en cada mutación.
// - Todo payload pasa por su esquema Zod (lib/schemas.ts) antes del fetch: apiSend().

import type { ZodType, ZodTypeDef } from 'zod';
import {
  CommentCreateSchema,
  LoginSchema,
  PostCreateSchema,
  RegisterSchema,
  ReportCreateSchema,
  type CommentCreateInput,
  type LoginInput,
  type PostCreateInput,
  type RegisterInput,
  type ReportCreateInput,
} from './schemas';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie('csrf_token');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  });

  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = res.statusText;
    try {
      const data = await res.json();
      code = data.error ?? code;
      message = data.message ?? message;
    } catch {
      // Respuesta sin JSON: se conserva statusText
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Valida el payload con Zod y, solo si es correcto, lo envía. Un fallo se lanza como ApiError 400
// (VALIDATION_ERROR) con el campo afectado, igual que lo haría el backend.
export async function apiSend<T, I>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  schema: ZodType<I, ZodTypeDef, unknown>,
  payload: unknown,
): Promise<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, 'VALIDATION_ERROR', issue.message, issue.path.join('.'));
  }
  return apiFetch<T>(path, { method, body: JSON.stringify(parsed.data) });
}

export const api = {
  login: (input: LoginInput) => apiSend<{ access_token: string }, LoginInput>('/auth/login', 'POST', LoginSchema, input),
  register: (input: RegisterInput) => apiSend<{ access_token: string }, RegisterInput>('/auth/register', 'POST', RegisterSchema, input),
  createPost: (input: PostCreateInput) => apiSend<{ id: string }, PostCreateInput>('/posts', 'POST', PostCreateSchema, input),
  createComment: (input: CommentCreateInput) => apiSend<{ id: string }, CommentCreateInput>('/comments', 'POST', CommentCreateSchema, input),
  createReport: (input: ReportCreateInput) => apiSend<{ id: string }, ReportCreateInput>('/reports', 'POST', ReportCreateSchema, input),
};
