const TEXT_KV_RE = /(\w+)=(?:"([^"]*)"|([\S]*))/g;
const MSG_AUTH_RE = /(Successful|Unsuccessful) (\w+) authentication attempt (?:made )?by user '([^']+)'/;
const MSG_BAN_RE = /banned until (.+)$/;

export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let fields;
  if (trimmed.startsWith('{')) {
    fields = parseJson(trimmed);
  } else {
    fields = parseText(trimmed);
  }

  if (!fields || !fields.msg) return null;
  return extractEvent(fields, trimmed);
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseText(line) {
  const fields = {};
  let match;
  TEXT_KV_RE.lastIndex = 0;
  while ((match = TEXT_KV_RE.exec(line)) !== null) {
    fields[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

function extractEvent(fields, rawLog) {
  const msg = fields.msg || '';
  const authMatch = MSG_AUTH_RE.exec(msg);
  if (!authMatch) return null;

  const [, outcome, method, username] = authMatch;
  const success = outcome === 'Successful';
  const is2fa = method !== '1FA';

  let event_type;
  if (is2fa) {
    event_type = success ? '2fa_success' : '2fa_failure';
  } else {
    event_type = success ? '1fa_success' : '1fa_failure';
  }

  const event = {
    timestamp: fields.time || new Date().toISOString(),
    event_type,
    username,
    remote_ip: fields.remote_ip || null,
    method: is2fa ? method : fields.method || null,
    raw_log: rawLog,
  };

  // Check for ban in the same or subsequent message context
  const banMatch = MSG_BAN_RE.exec(msg);
  if (banMatch) {
    event.event_type = 'ban';
    event.ban_until = banMatch[1];
  }

  return event;
}
