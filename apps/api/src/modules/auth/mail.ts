import nodemailer from 'nodemailer';
import type { Config } from '../../config.ts';

export function createMailTransport(config: Config) {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    requireTLS: config.NODE_ENV === 'production' && config.SMTP_PORT !== 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}
