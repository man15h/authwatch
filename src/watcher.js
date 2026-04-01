import { open, stat, watch } from 'node:fs/promises';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { getCursor, setCursor } from './db.js';

const MAX_CHUNK_SIZE = 16 * 1024 * 1024; // 16MB max per read cycle

export async function startWatcher(onEvent) {
  const config = getConfig();
  const log = getLogger();
  const logPath = config.authelia.log_path;

  log.info({ logPath }, 'Starting log watcher');

  let position = getCursor();
  let processing = false;

  async function processNewLines() {
    if (processing) return;
    processing = true;

    try {
      let fileInfo;
      try {
        fileInfo = await stat(logPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          log.warn({ logPath }, 'Log file not found — waiting for it to appear');
          return;
        }
        throw err;
      }

      // File was truncated/rotated — reset position
      if (fileInfo.size < position) {
        log.info('Log file rotated — resetting position');
        position = 0;
      }

      if (fileInfo.size === position) return;

      const fh = await open(logPath, 'r');
      try {
        // Read in capped chunks to prevent OOM under heavy log volume
        const bytesAvailable = fileInfo.size - position;
        const readSize = Math.min(bytesAvailable, MAX_CHUNK_SIZE);
        const buf = Buffer.alloc(readSize);
        await fh.read(buf, 0, readSize, position);
        const chunk = buf.toString('utf8');
        const lines = chunk.split('\n');

        if (bytesAvailable > MAX_CHUNK_SIZE) {
          log.warn({ skipped: bytesAvailable - MAX_CHUNK_SIZE }, 'Log chunk exceeded max size — some lines skipped');
        }

        for (const line of lines) {
          if (line.trim()) {
            try {
              await onEvent(line);
            } catch (err) {
              log.error({ err, line: line.substring(0, 200) }, 'Error processing log line');
            }
          }
        }

        position = position + readSize;
        setCursor(position);
      } finally {
        await fh.close();
      }
    } catch (err) {
      log.error({ err }, 'Error reading log file');
    } finally {
      processing = false;
    }
  }

  // Initial read of existing content
  await processNewLines();

  // Watch for changes
  const ac = new AbortController();

  async function watchLoop() {
    try {
      const watcher = watch(logPath, { signal: ac.signal });
      for await (const event of watcher) {
        if (event.eventType === 'change') {
          await processNewLines();
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      log.warn({ err }, 'File watcher error — falling back to polling');
      await pollLoop(ac.signal);
    }
  }

  async function pollLoop(signal) {
    while (!signal.aborted) {
      await processNewLines();
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  }

  // Try fs.watch first, fall back to polling if the filesystem doesn't support it
  watchLoop().catch((err) => {
    log.error({ err }, 'Watcher died unexpectedly');
    process.exit(1);
  });

  return () => ac.abort();
}
