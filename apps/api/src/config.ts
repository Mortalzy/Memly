import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().startsWith('postgres'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  TRUSTED_ORIGINS: z.string().min(1),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv) {
  const config = schema.parse(env);
  const origins = config.TRUSTED_ORIGINS.split(',').map((origin) => {
    const url = new URL(origin.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.trim()) {
      throw new Error('TRUSTED_ORIGINS должен содержать точные HTTP(S) origins без пути');
    }
    return url.origin;
  });
  const smtpEnabled = Boolean(config.SMTP_HOST && config.SMTP_FROM);
  if (config.SMTP_HOST && !config.SMTP_FROM) throw new Error('Укажите SMTP_FROM');
  if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD)) {
    throw new Error('Укажите SMTP_USER и SMTP_PASSWORD вместе');
  }
  if (
    config.NODE_ENV === 'production' &&
    (!smtpEnabled ||
      origins.some((origin) => !origin.startsWith('https://')) ||
      !config.BETTER_AUTH_URL.startsWith('https://'))
  ) {
    throw new Error('Production требует HTTPS и SMTP для подтверждения почты');
  }
  return { ...config, origins, smtpEnabled };
}
export type Config = ReturnType<typeof loadConfig>;
