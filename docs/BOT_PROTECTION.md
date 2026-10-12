# Auditing a site that has bot protection

The auditor opens the page in Chromium. If the site answers with a bot check (a "Just a moment..." or "Verify you are human" page) the audit stops and says so. It never tries to get past the check by hiding what it is, and it never solves a challenge. There are three honest ways through.

## 1. Site owner allowlists the auditor (recommended)

Every capture sends `WCAGAuditor/<version>` at the end of the user-agent string. You can also give the auditor a secret request header. Set it where the API runs:

```
AUDIT_EXTRA_HEADERS='{"X-Audit-Key":"<long random secret>"}'
```

The header is sent only on requests to the audited site (the same host, with or without `www.`), never to third parties. The run record, `meta.json`, `VERSIONS.json`, logs and the web app show only the header names, never the values. A malformed value stops the API from starting and the error does not repeat the value.

### Cloudflare

Create a WAF custom rule (Security, WAF, Custom rules):

- Expression (Edit expression):

  ```
  any(http.request.headers["x-audit-key"][*] eq "<long random secret>")
  ```

  Header names in this field are lowercase; values are case sensitive.
- Action: **Skip**. Under "Log matching requests" choose as needed and tick the things to skip: **All Super Bot Fight Mode Rules**, **All managed rules**, **All rate limiting rules**. Browser Integrity Check and Security Level can also be skipped here.
- Place the rule first so nothing runs before it.

Classic **Bot Fight Mode** (the free-plan setting) cannot be skipped by any rule. To audit such a site, turn Bot Fight Mode off, or move to Super Bot Fight Mode, which a Skip rule can bypass. A header secret is weaker than an IP rule because anyone who learns it can use it, so rotate it after the audit period.

### IP alternative

Add an IP Access Rule (Security, WAF, Tools) with action Allow for the address the auditor runs from, or use the same Skip rule with the expression `ip.src eq <address>` instead of the header. This needs a stable address.

Other vendors have the same idea under different names (an allowlist rule keyed on a header or IP); check your vendor's documentation.

## 2. A person passes the check in a real browser window

In New audit, open Advanced and tick "Open a browser window so I can pass a bot check or sign in". Or from the command line: `auditor audit --url <url> --out <dir> --verify-in-browser`.

A visible Chromium window opens with a saved profile (`DATA_DIR/browser-profile`). If a bot check appears, the audit waits (5 minutes by default, `VERIFY_TIMEOUT_S` or `--verify-timeout-s`) while you complete it, then continues in the same window. The mobile capture reuses the same profile and user agent so the clearance carries over. Later runs reuse the profile, so the clearance often lasts for a while. If time runs out the audit fails with the bot-check message.

This only works when the API runs on your own machine, because the window opens on the machine that runs the API. A person passing the check is the intended use of a challenge; nothing is automated.

Captures made this way are marked `headed_session: true` in `meta.json`. They are a different capture environment from the headless captures used for the benchmark, which this option never touches.

## 3. Audit screenshots instead

Take full-page screenshots yourself (desktop and mobile) and upload them in New audit under Screenshots. Screenshot-only audits have no DOM, so some criteria report "needs review" or "not assessable".
