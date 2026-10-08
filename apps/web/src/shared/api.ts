export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error?.message ?? 'Не удалось связаться с сервером');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие';
