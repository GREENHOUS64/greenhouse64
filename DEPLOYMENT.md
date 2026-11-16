# GREENHOUSE production setup

Static site for GitHub Pages. The browser contains only the Supabase URL and publishable key; never publish secret/service-role keys.

## Supabase

- Project: GREENHOUSE (`yiwvtxvmtpncqoycgfzx`); schema, lead form, private rate limits, and owner allowlist are configured.
- Rate-limit table has RLS enabled and is accessible through server role only.
- Edge Function `submit-lead` accepts only `https://greenhous64.github.io`. Update the origin and redeploy if you change the domain.
- Owner `egorte2008@mail.ru` is allowlisted. Set or reset its password via Supabase Auth; credentials are not stored in this repository.
- Form and admin panel use the configured project URL and publishable key in `supabase-client-config.js`.
- Prices are not stored. Requests are limited to five per hashed IP per hour; raw IP addresses are not stored.

## Google Analytics 4

GA4 Measurement ID `G-0ZKCXNVC1R` is configured. Analytics loads only after visitor consent.

## Before public launch

- Add the legal operator identity, INN, contact/address, and retention period to `privacy.html` when available.
- Review Supabase Auth leaked-password protection in project Authentication security settings.
- Test owner login, denied non-admin login, lead status and plant management.


