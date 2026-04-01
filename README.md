# AuthWatch

Lightweight Docker sidecar that watches [Authelia](https://www.authelia.com/) logs for authentication events and sends notifications via SMTP and [ntfy](https://ntfy.sh/).

## Why?

Authelia has no built-in login notifications ([#7695](https://github.com/authelia/authelia/issues/7695) is still in design). AuthWatch fills this gap — get alerts when someone logs in, fails authentication, or gets banned.

## Features

- Watches Authelia log files in real-time
- Detects: successful/failed 1FA, successful/failed 2FA (TOTP/WebAuthn/Duo), bans
- Sends notifications via **SMTP** (Resend, Gmail, SES, etc.) and **ntfy**
- Rate limiting to prevent notification spam during brute-force attacks
- SQLite event history with configurable retention
- Auto-detects text and JSON log formats
- Resumes from last position after restarts
- Tiny footprint: ~128MB memory limit, 4 dependencies

## Quick Start

### 1. Configure Authelia to write logs to a file

Add `file_path` to your Authelia `configuration.yml`:

```yaml
log:
  level: info     # use 'debug' if you want success notifications
  file_path: /config/authelia.log
```

> **Note:** Successful login events (`1fa_success`, `2fa_success`) are logged at `debug` level in Authelia. Set `log.level: debug` to capture these. Failed events and bans are logged at `info`/`error` level.

### 2. Create your AuthWatch config

```bash
cp config.example.yml config.yml
```

Edit `config.yml` — at minimum, set the log path and enable a notification channel:

```yaml
authelia:
  log_path: /logs/authelia.log

notifications:
  smtp:
    enabled: true
    host: smtp.resend.com
    port: 465
    secure: true
    username: resend
    password: "${SMTP_PASSWORD}"
    from: "AuthWatch <authwatch@yourdomain.com>"
    to:
      - you@example.com
```

### 3. Run with Docker

```yaml
# Add to your auth-stack docker-compose.yml
services:
  authwatch:
    image: ghcr.io/yourusername/authwatch:latest
    container_name: authwatch
    restart: unless-stopped
    environment:
      TZ: UTC
      CONFIG_PATH: /config.yml
      SMTP_PASSWORD: ${SMTP_PASSWORD}
    volumes:
      - ./authwatch-config.yml:/config.yml:ro
      - authwatch-data:/data
      - authelia-config:/logs:ro    # same volume Authelia writes logs to
    security_opt:
      - no-new-privileges:true

volumes:
  authwatch-data:
```

Or run standalone:

```bash
docker compose up -d
```

## Configuration

See [config.example.yml](config.example.yml) for all options with documentation.

### Events

| Event | Description | Default | Authelia Log Level |
|-------|-------------|---------|-------------------|
| `1fa_success` | Successful password login | OFF | debug |
| `1fa_failure` | Failed password login | ON | info |
| `2fa_success` | Successful 2FA verification | ON | debug |
| `2fa_failure` | Failed 2FA verification | ON | info |
| `ban` | User banned after repeated failures | ON | error |

### Environment Variable Substitution

Use `${VAR_NAME}` in your config to reference environment variables:

```yaml
notifications:
  smtp:
    password: "${SMTP_PASSWORD}"
  ntfy:
    token: "${NTFY_TOKEN}"
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
