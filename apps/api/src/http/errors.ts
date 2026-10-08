import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@memly/database';
import type { Logger } from 'pino';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const missing = () => new AppError(404, 'NOT_FOUND', 'Материал не найден');
export const conflict = () =>
  new AppError(
    409,
    'REVISION_CONFLICT',
    'Материал изменился. Обновите страницу перед сохранением.',
  );

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Не удалось выполнить запрос';
    let details: unknown;
    if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Проверьте заполненные поля';
      details = error.issues.map(({ path, message }) => ({ path, message }));
    } else if (error instanceof AppError) {
      ({ status, code, message } = error);
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2002'].includes(error.code)
    ) {
      status = 409;
      code = 'CONFLICT';
      message = 'Конфликт изменений. Повторите запрос.';
    } else if (error instanceof SyntaxError && 'body' in error) {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Некорректный JSON';
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Слишком большой запрос';
    }
    // Never log request bodies, cookies, query strings or database error text.
    if (status >= 500)
      logger.error(
        {
          requestId: response.locals.requestId,
          errorType: error instanceof Error ? error.name : 'unknown',
        },
        'Request failed',
      );
    response
      .status(status)
      .json({ error: { code, message, details, requestId: response.locals.requestId } });
  };
}
