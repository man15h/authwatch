import nodemailer from 'nodemailer';
import { getLogger } from '../logger.js';

let _transporter = null;

export function initSmtp(config) {
  _transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? true,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  getLogger().info({ host: config.host, port: config.port }, 'SMTP channel initialized');
}

export async function sendSmtp(config, notification) {
  if (!_transporter) return;
  const log = getLogger();

  const recipients = Array.isArray(config.to) ? config.to : [config.to];

  try {
    await _transporter.sendMail({
      from: config.from,
      to: recipients.join(', '),
      subject: notification.title,
      text: notification.body,
    });
    log.info({ to: recipients, subject: notification.title }, 'Email sent');
  } catch (err) {
    log.error({ err, to: recipients }, 'Failed to send email');
  }
}
