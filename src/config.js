import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const DEFAULT_CONFIG = {
  authelia: {
    log_path: '/logs/authelia.log',
  },
  database: {
    path: '/data/authwatch.db',
    retention_days: 90,
  },
  events: {
    '1fa_success': false,
    '1fa_failure': true,
    '2fa_success': true,
    '2fa_failure': true,
    ban: true,
  },
  rate_limit: {
    cooldown_minutes: 5,
  },
  ldap: {
    enabled: false,
  },
  notifications: {
    admin_email: null,
    smtp: { enabled: false },
    ntfy: { enabled: false },
  },
  log: {
    level: 'info',
  },
};

function substituteEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

let _config = null;

export function loadConfig(configPath) {
  const path = configPath || process.env.CONFIG_PATH || '/config.yml';
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = yaml.load(raw) || {};
    const substituted = substituteEnvVars(parsed);
    _config = deepMerge(DEFAULT_CONFIG, substituted);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Config file not found: ${path} — using defaults`);
      _config = { ...DEFAULT_CONFIG };
    } else {
      throw err;
    }
  }
  return _config;
}

export function getConfig() {
  if (!_config) throw new Error('Config not loaded — call loadConfig() first');
  return _config;
}
