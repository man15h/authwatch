import pino from 'pino';
import { getConfig } from './config.js';

let _logger = null;

export function initLogger() {
  const config = getConfig();
  _logger = pino({
    level: config.log?.level || 'info',
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  });
  return _logger;
}

export function getLogger() {
  if (!_logger) {
    _logger = pino({ level: 'info' });
  }
  return _logger;
}
