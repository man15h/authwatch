# AuthWatch

Lightweight Docker sidecar that watches [Authelia](https://www.authelia.com/) logs for authentication events and sends per-user notifications via SMTP and [ntfy](https://ntfy.sh/).

## Why?

Authelia has no built-in login notifications ([#7695](https://github.com/authelia/authelia/issues/7695) is still in design). AuthWatch fills this gap — get alerts when someone logs in, fails authentication, or gets banned.

## Features

- Watches Authelia log files in real-time (no Docker socket needed)
- Detects: successful/failed 1FA, successful/failed 2FA (TOTP/WebAuthn/Duo), bans
- **Per-user notifications** via LDAP email lookup (LLDAP/OpenLDAP compatible)
- Sends alerts via **SMTP** (Resend, Gmail, SES, etc.) and **ntfy**
- Auto-detects text and JSON log formats
- SQLite event history with configurable retention
- Resumes from last position after restarts
- Tiny footprint: ~128MB memory limit, 5 production dependencies

## How It Works

```
Authelia → log file → AuthWatch (file watcher) → Parser → SQLite
                                                         → LDAP (resolve email)
                                                         → SMTP / ntfy
```

1. Authelia writes auth events to a log file
2. AuthWatch watches the file for new lines (fs.watch + polling fallback)
3. Parser auto-detects text or JSON format and extracts auth events
4. Events are stored in SQLite with a cursor for restart resilience
5. Username is resolved to email via LDAP
6. Notification is sent to the user via SMTP and/or ntfy

## Quick Start

### 1. Configure Authelia to write logs to a file

Add `file_path` to your Authelia `configuration.yml`:

```yaml
log:
  level: info     # use 'debug' if you want login success notifications
  file_path: /config/authelia.log
```

> **Note:** Successful login events (`1fa_success`, `2fa_success`) are logged at `debug` level in Authelia. Failed events and bans are logged at `info`/`error` level.

### 2. Create your AuthWatch config

```bash
cp config.example.yml config.yml
```

Edit `config.yml` — set the log path, LDAP connection, and notification channel:

```yaml
authelia:
  log_path: /logs/authelia.log

ldap:
  enabled: true
  url: ldap://lldap:3890
  base_dn: dc=opposites,dc=solar
  user_base: ou=people,dc=opposites,dc=solar
  bind_dn: uid=authwatch,ou=people,dc=opposites,dc=solar
  bind_password: "${LDAP_BIND_PASSWORD}"

notifications:
  admin_email: admin@example.com    # fallback when LDAP lookup fails

  smtp:
    enabled: true
    host: smtp.resend.com
    port: 465
    secure: true
    username: resend
    password: "${SMTP_PASSWORD}"
    from: "AuthWatch <authwatch@yourdomain.com>"
```

### 3. Create a read-only LDAP user

AuthWatch needs an LDAP user to look up email addresses. In LLDAP:

1. Create user `authwatch` with a strong password
2. Do **not** add it to any groups (no admin access needed)
3. This user can only read the `mail` attribute of other users

### 4. Add to your auth-stack

Add AuthWatch as a sidecar in your existing `docker-compose.yml`:

```yaml
services:
  authwatch:
    image: ghcr.io/man15h/authwatch:latest
    container_name: authwatch
    restart: unless-stopped
    environment:
      TZ: UTC
      CONFIG_PATH: /config.yml
      SMTP_PASSWORD: ${SMTP_PASSWORD}
      LDAP_BIND_PASSWORD: ${LDAP_BIND_PASSWORD}
    volumes:
      - ./authwatch-config.yml:/config.yml:ro
      - authwatch-data:/data
      - authelia-config:/logs:ro    # same volume Authelia writes logs to
    security_opt:
      - no-new-privileges:true
    depends_on:
      - authelia
      - lldap

volumes:
  authwatch-data:
```

The key is sharing Authelia's config volume so AuthWatch can read the log file.

## Configuration

See [config.example.yml](config.example.yml) for all options.

### Events

| Event | Description | Default | Authelia Log Level |
|-------|-------------|---------|-------------------|
| `1fa_success` | Successful password login | OFF | debug |
| `1fa_failure` | Failed password login | ON | info |
| `2fa_success` | Successful 2FA verification | ON | debug |
| `2fa_failure` | Failed 2FA verification | ON | info |
| `ban` | User banned after repeated failures | ON | error |

### LDAP Email Lookup

AuthWatch resolves `username → email` via LDAP so each user receives notifications about their own account. If LDAP is disabled or the lookup fails, notifications go to `admin_email` as a fallback.

Works with:
- **LLDAP** (lightweight, recommended for homelabs)
- **OpenLDAP**
- Any LDAP-compatible directory

### Environment Variable Substitution

Use `${VAR_NAME}` in your config to reference environment variables:

```yaml
ldap:
  bind_password: "${LDAP_BIND_PASSWORD}"
notifications:
  smtp:
    password: "${SMTP_PASSWORD}"
```

### ntfy

```yaml
notifications:
  ntfy:
    enabled: true
    url: https://ntfy.sh        # or your self-hosted instance
    topic: authwatch
    token: "${NTFY_TOKEN}"      # optional
    priority:
      default: 3
      failure: 4
      ban: 5                    # urgent
```

## Development

```bash
npm install
npm test
npm start
```

## License

MIT
