import { loadConfig } from './config.js';
import { initLogger, getLogger } from './logger.js';
import { initDb, insertEvent, pruneEvents, closeDb } from './db.js';
import { parseLine } from './parser.js';
import { initNotifier, notify } from './notifier.js';
import { initLdap } from './ldap.js';
import { startWatcher } from './watcher.js';

// Load config and initialize
loadConfig();
const log = initLogger();
await initDb();
initLdap();
initNotifier();

log.info('AuthWatch starting');

// Prune old events on startup, then daily
pruneEvents();
const pruneInterval = setInterval(pruneEvents, 24 * 60 * 60 * 1000);

// Process each log line
async function handleLine(line) {
  const event = parseLine(line);
  if (!event) return;

  const eventId = insertEvent(event);
  log.info({ event_type: event.event_type, username: event.username, remote_ip: event.remote_ip }, 'Auth event detected');

  await notify(event, eventId);
}

// Start watching
const stopWatcher = await startWatcher(handleLine);

// Graceful shutdown
function shutdown(signal) {
  log.info({ signal }, 'Shutting down');
  stopWatcher();
  clearInterval(pruneInterval);
  closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
