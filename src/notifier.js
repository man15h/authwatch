import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { getRecentEvents, markNotified } from './db.js';
import { renderTemplate } from './templates.js';
import { initSmtp, sendSmtp } from './channels/smtp.js';
import { sendNtfy } from './channels/ntfy.js';
import { lookupEmail } from './ldap.js';

export function initNotifier() {
  const config = getConfig();
  if (config.notifications.smtp?.enabled) {
    initSmtp(config.notifications.smtp);
  }
  getLogger().info('Notifier initialized');
}

export async function notify(event, eventId) {
  const config = getConfig();
  const log = getLogger();

  // Check if this event type is enabled
  if (!config.events[event.event_type]) return;

  // Rate limiting — check for recent duplicate notifications
  const cooldown = config.rate_limit?.cooldown_minutes || 5;
  if (event.username) {
    const recent = getRecentEvents(event.username, event.event_type, cooldown);
    const recentNotified = recent.filter(e => e.notified_at);
    if (recentNotified.length > 0) {
      log.debug({ username: event.username, event_type: event.event_type }, 'Rate limited — skipping notification');
      return;
    }
  }

  const notification = renderTemplate(event);
  if (!notification) return;

  // Resolve user email via LDAP, fall back to admin_email
  let userEmail = null;
  if (event.username) {
    userEmail = await lookupEmail(event.username);
  }
  const recipientEmail = userEmail || config.notifications.admin_email || null;

  const promises = [];

  if (config.notifications.smtp?.enabled && recipientEmail) {
    // Send to the user's email (resolved via LDAP) instead of static config
    const smtpConfig = { ...config.notifications.smtp, to: recipientEmail };
    promises.push(sendSmtp(smtpConfig, notification));
  }

  if (config.notifications.ntfy?.enabled) {
    promises.push(sendNtfy(config.notifications.ntfy, notification));
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
    markNotified(eventId);
  }
}
