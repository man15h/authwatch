import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from './parser.js';

describe('parseLine', () => {
  describe('text format', () => {
    it('parses successful 1FA login', () => {
      const line = `time="2026-03-31T10:15:42+05:30" level=debug msg="Successful 1FA authentication attempt made by user 'john'" method=POST path=/api/firstfactor remote_ip=192.168.1.100`;
      const event = parseLine(line);
      assert.equal(event.event_type, '1fa_success');
      assert.equal(event.username, 'john');
      assert.equal(event.remote_ip, '192.168.1.100');
      assert.equal(event.timestamp, '2026-03-31T10:15:42+05:30');
    });

    it('parses failed 1FA login', () => {
      const line = `time="2026-03-31T10:15:42+05:30" level=error msg="Unsuccessful 1FA authentication attempt by user 'jane'" method=POST path=/api/firstfactor remote_ip=10.0.0.5`;
      const event = parseLine(line);
      assert.equal(event.event_type, '1fa_failure');
      assert.equal(event.username, 'jane');
      assert.equal(event.remote_ip, '10.0.0.5');
    });

    it('parses successful 2FA TOTP', () => {
      const line = `time="2026-03-31T10:16:00+05:30" level=debug msg="Successful TOTP authentication attempt made by user 'john'" method=POST path=/api/secondfactor/totp remote_ip=192.168.1.100`;
      const event = parseLine(line);
      assert.equal(event.event_type, '2fa_success');
      assert.equal(event.username, 'john');
      assert.equal(event.method, 'TOTP');
    });

    it('parses failed 2FA WebAuthn', () => {
      const line = `time="2026-03-31T10:16:30+05:30" level=error msg="Unsuccessful WebAuthn authentication attempt by user 'jane'" method=POST path=/api/secondfactor/webauthn remote_ip=10.0.0.5`;
      const event = parseLine(line);
      assert.equal(event.event_type, '2fa_failure');
      assert.equal(event.username, 'jane');
      assert.equal(event.method, 'WebAuthn');
    });

    it('parses ban event', () => {
      const line = `time="2026-03-31T10:20:00+05:30" level=error msg="Unsuccessful 1FA authentication attempt by user 'attacker' and they are banned until 2026-03-31T10:30:00+05:30" method=POST path=/api/firstfactor remote_ip=1.2.3.4`;
      const event = parseLine(line);
      assert.equal(event.event_type, 'ban');
      assert.equal(event.username, 'attacker');
      assert.equal(event.ban_until, '2026-03-31T10:30:00+05:30');
    });

    it('parses ban event with human-readable time (v4.39+)', () => {
      const line = `time="2026-04-06T12:46:41+02:00" level=error msg="Unsuccessful 1FA authentication attempt by user 'attacker' and they are banned until 12:46:41PM on April 6 2025 (+02:00)" method=POST path=/api/firstfactor remote_ip=1.2.3.4`;
      const event = parseLine(line);
      assert.equal(event.event_type, 'ban');
      assert.equal(event.username, 'attacker');
      assert.equal(event.ban_until, '12:46:41PM on April 6 2025 (+02:00)');
    });
  });

  describe('JSON format', () => {
    it('parses successful 1FA login', () => {
      const line = `{"level":"debug","msg":"Successful 1FA authentication attempt made by user 'alice'","time":"2026-03-31T10:15:42Z","method":"POST","path":"/api/firstfactor","remote_ip":"172.16.0.1"}`;
      const event = parseLine(line);
      assert.equal(event.event_type, '1fa_success');
      assert.equal(event.username, 'alice');
      assert.equal(event.remote_ip, '172.16.0.1');
    });

    it('parses failed 1FA login', () => {
      const line = `{"level":"error","msg":"Unsuccessful 1FA authentication attempt by user 'bob'","time":"2026-03-31T10:15:42Z","method":"POST","path":"/api/firstfactor","remote_ip":"10.0.0.1"}`;
      const event = parseLine(line);
      assert.equal(event.event_type, '1fa_failure');
      assert.equal(event.username, 'bob');
    });

    it('parses ban event', () => {
      const line = `{"level":"error","msg":"Unsuccessful 1FA authentication attempt by user 'hacker' and they are banned until 2026-03-31T11:00:00Z","time":"2026-03-31T10:50:00Z","remote_ip":"5.6.7.8"}`;
      const event = parseLine(line);
      assert.equal(event.event_type, 'ban');
      assert.equal(event.username, 'hacker');
      assert.equal(event.ban_until, '2026-03-31T11:00:00Z');
    });
  });

  describe('non-auth lines', () => {
    it('returns null for empty lines', () => {
      assert.equal(parseLine(''), null);
      assert.equal(parseLine('   '), null);
    });

    it('returns null for non-auth log lines', () => {
      const line = `time="2026-03-31T10:00:00Z" level=info msg="Authelia v4.39.16 starting"`;
      assert.equal(parseLine(line), null);
    });

    it('returns null for malformed JSON', () => {
      assert.equal(parseLine('{broken json'), null);
    });
  });
});
