import { Client } from 'ldapts';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function initLdap() {
  const config = getConfig();
  if (!config.ldap?.enabled) return;
  getLogger().info({ url: config.ldap.url }, 'LDAP lookup enabled');
}

// RFC 4515 — escape all LDAP filter special characters
function escapeFilter(value) {
  return value.replace(/[\\*()\x00]/g, (ch) => {
    return '\\' + ch.charCodeAt(0).toString(16).padStart(2, '0');
  });
}

export async function lookupEmail(username) {
  const config = getConfig().ldap;
  if (!config?.enabled) return null;

  const cached = _cache.get(username);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.email;
  }

  const log = getLogger();
  const client = new Client({ url: config.url, connectTimeout: config.timeout || 5000 });

  try {
    await client.bind(config.bind_dn, config.bind_password);

    const searchBase = config.user_base || `ou=people,${config.base_dn}`;
    const { searchEntries } = await client.search(searchBase, {
      filter: `(&(uid=${escapeFilter(username)})(objectClass=person))`,
      attributes: ['mail'],
      scope: 'sub',
    });

    const email = searchEntries[0]?.mail || null;

    _cache.set(username, { email, time: Date.now() });

    if (email) {
      log.debug({ username, email }, 'Resolved user email via LDAP');
    } else {
      log.warn({ username }, 'No email found in LDAP for user');
    }

    return email;
  } catch (err) {
    log.error({ err, username }, 'LDAP lookup failed');
    return null;
  } finally {
    try { await client.unbind(); } catch {}
  }
}
