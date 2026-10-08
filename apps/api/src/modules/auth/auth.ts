import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { fromNodeHeaders } from 'better-auth/node';
import nodemailer from 'nodemailer';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '@memly/database';
import type { Config } from '../../config.ts';
import { AppError } from '../../http/errors.ts';

export function createAuth(db: PrismaClient, config: Config) {
  const mail = config.smtpEnabled
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        requireTLS: config.NODE_ENV === 'production' && config.SMTP_PORT !== 465,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
      })
    : null;
  const send = async (email: string, subject: string, text: string) => {
    if (!mail) throw new Error('SMTP is not configured');
    await mail.sendMail({ from: config.SMTP_FROM, to: email, subject, text });
  };
  return betterAuth({
    appName: 'Memly',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    trustedOrigins: config.origins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: config.smtpEnabled,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: mail
        ? async ({ user, url }) =>
            send(
              user.email,
              'Memly — восстановление пароля',
              `Для установки нового пароля откройте ссылку:\n${url}\n\nЕсли вы не запрашивали восстановление, проигнорируйте письмо.`,
            )
        : undefined,
    },
    emailVerification: mail
      ? {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) =>
            send(user.email, 'Memly — подтверждение почты', `Подтвердите вашу почту:\n${url}`),
        }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    advanced: {
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['x-memly-client-ip'] },
    },
  });
}
export type Auth = ReturnType<typeof createAuth>;

export function requireSession(auth: Auth): RequestHandler {
  return async (request, response, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new AppError(401, 'UNAUTHORIZED', 'Войдите в аккаунт');
    response.locals.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
    next();
  };
}
