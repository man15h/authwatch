import { getLogger } from '../logger.js';

const PRIORITY_MAP = {
  default: 3,
  failure: 4,
  ban: 5,
};

export async function sendNtfy(config, notification) {
  const log = getLogger();
  const url = `${config.url.replace(/\/$/, '')}/${config.topic}`;

  const priorities = config.priority || {};
  const priority = priorities[notification.priority] || priorities.default || PRIORITY_MAP[notification.priority] || 3;

  const headers = {
    'Title': notification.title,
    'Priority': String(priority),
    'Tags': notification.event_type === 'ban' ? 'rotating_light' : notification.priority === 'failure' ? 'warning' : 'lock',
  };

  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: notification.body,
    });

    if (!res.ok) {
      log.error({ status: res.status, url }, 'ntfy request failed');
    } else {
      log.info({ topic: config.topic, title: notification.title }, 'ntfy notification sent');
    }
  } catch (err) {
    log.error({ err, url }, 'Failed to send ntfy notification');
  }
}
