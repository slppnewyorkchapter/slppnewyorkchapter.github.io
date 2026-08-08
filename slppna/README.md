# SLPP North America Regional Ticketing v6

This version fixes GitHub Pages <-> Google Apps Script browser transport.

## What changed
- Read-only GET actions (`eventConfig`, `voucher`, `batch`, `validateTicket`) support JSONP.
- Write/admin actions use a hidden POST form + iframe + `postMessage`, keeping attendee/admin data out of URLs.
- Apps Script only posts iframe responses back to `https://greenprofessionals.github.io`.
- The ticket renderer remains unchanged.

## Deploy
1. In the bound Google Apps Script project, replace the current code with `Code.gs`.
2. Deploy > Manage deployments > Edit > New version > Deploy. Keep the same web app `/exec` URL.
3. Replace GitHub `slppna/claim.html` with this `claim.html`.
4. Keep `assets/js/ticket-renderer.js` as-is (included for completeness).
5. Commit and push GitHub. Wait for Pages deployment to finish.
6. Hard-refresh the event URL.

## Test
Open the Apps Script URL with:
`?action=eventConfig&chapter=NEC&event=NEC-2026-INAUGURATION&callback=testCallback`
The response should be JavaScript beginning with `testCallback(`.
