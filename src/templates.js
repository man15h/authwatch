const TEMPLATES = {
  '1fa_success': {
    title: 'Login: {username}',
    body: '{username} logged in from {remote_ip} at {time}',
    priority: 'default',
  },
  '1fa_failure': {
    title: 'Failed Login: {username}',
    body: 'Failed login attempt for {username} from {remote_ip} at {time}',
    priority: 'failure',
  },
  '2fa_success': {
    title: '2FA Verified: {username}',
    body: '{username} completed {method} verification from {remote_ip} at {time}',
    priority: 'default',
  },
  '2fa_failure': {
    title: '2FA Failed: {username}',
    body: 'Failed {method} verification for {username} from {remote_ip} at {time}',
    priority: 'failure',
  },
  ban: {
    title: 'User Banned: {username}',
    body: '{username} has been banned until {ban_until} after repeated failed attempts from {remote_ip}',
    priority: 'ban',
  },
};

export function renderTemplate(event) {
  const template = TEMPLATES[event.event_type];
  if (!template) return null;

  const vars = {
    username: event.username || 'unknown',
    remote_ip: event.remote_ip || 'unknown',
    method: event.method || 'unknown',
    time: event.timestamp || new Date().toISOString(),
    ban_until: event.ban_until || 'unknown',
  };

  const fill = (str) => str.replace(/\{(\w+)\}/g, (_, key) => vars[key] || key);

  return {
    title: fill(template.title),
    body: fill(template.body),
    priority: template.priority,
    event_type: event.event_type,
  };
}
