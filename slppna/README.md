# SLPP Hybrid Ticketing - GitHub Upload

This public folder keeps the proven SLPP Tickets workflow/UI and replaces only the final ticket artwork generation with the SLPP North America regional master renderer.

## Upload hierarchy

Copy the **slppna** folder into the root of `slppnewyorkchapter.github.io` using GitHub Desktop.

```text
slppnewyorkchapter.github.io/
└── slppna/
    ├── .nojekyll
    ├── index.html
    ├── claim.html
    ├── v.html
    ├── assets/
    │   └── js/
    │       ├── app-config.js
    │       └── ticket-renderer.js
    └── tickets/
        ├── azc/skyline-bg.png
        ├── canc/skyline-bg.png
        ├── casc/skyline-bg.png
        ├── drc/skyline-bg.png
        ├── dvc/skyline-bg.png
        ├── flc/skyline-bg.png
        ├── gac/skyline-bg.png
        ├── iac/skyline-bg.png
        ├── ilc/skyline-bg.png
        ├── mnc/skyline-bg.png
        ├── ndc/skyline-bg.png
        ├── nec/skyline-bg.png
        ├── njc/skyline-bg.png
        ├── nyc/skyline-bg.png
        ├── ohc/skyline-bg.png
        ├── swc/skyline-bg.png
        ├── txdc/skyline-bg.png
        ├── txhc/skyline-bg.png
        ├── vac/skyline-bg.png
        └── wdc/skyline-bg.png
```

## Website URLs

Default New York page:
`https://slppnewyorkchapter.github.io/slppna/claim.html?org=SLPPNA&chapter=NYC&event=NYC-2026-INAUGURATION`

New England page:
`https://slppnewyorkchapter.github.io/slppna/claim.html?org=SLPPNA&chapter=NEC&event=NEC-2026-INAUGURATION`

## Two backend roles

- `workflowEndpoint` = the existing SLPP Tickets backend. It remains responsible for claims, vouchers, distribution, admin unlock, check-in, walk-ins and reporting.
- `ticketConfigEndpoint` = the regional configuration endpoint. It is read only when building the actual ticket image, supplying chapter/event/tier/skyline/colors.

Both URLs are in `assets/js/app-config.js`.

## Important

Do **not** put the private Apps Script source or spreadsheets from the companion private setup packet in a public GitHub repository. The legacy workflow backend contains administrator passcodes.


## Updated design rules

- Ticket configuration remains private in Google Sheets / Apps Script. No public configuration interface is exposed.
- Public URLs support `org`, `chapter`, and `event` filters.
- The ticket renderer supports a dynamic number of tiers and pricing modes `FIXED`, `DONATION`, and `FREE` when supplied by the backend.
- The chapter skyline is rendered about 25% larger than the prior version for stronger visual presence.
- System-owner / event-organizer permissions and voucher-generation expiration are backend authorization concerns and should not be stored in this public repository.
