# Private Backend Requirements (do not store secrets here)

The public GitHub UI is intentionally configuration-free. The private Apps Script / Google Sheets backend should scope all operational data with:

- `OrganizationID`
- `EventID`
- `ChapterCode`

Recommended private tables:

- Organizations
- Chapters
- Events
- TicketTypes
- Admins
- EventPermissions
- Tickets
- Vouchers
- Batches
- Counters
- CheckIns
- AuditLog
- EventGroups

## TicketTypes

Ticket types are event-specific and may have any title or count. Recommended fields:

`OrganizationID, EventID, TierCode, TierLabel, PricingType, Price, MinimumAmount, SuggestedAmount, Currency, AdmitCount, Capacity, Description, SortOrder, Active`

Supported `PricingType` values for the public renderer:

- `FIXED`
- `DONATION`
- `FREE`

## Owner-controlled organizer authorization

Recommended `EventPermissions` fields:

`PermissionID, OrganizationID, EventID, AdminID, CanGenerateVouchers, CanCheckIn, CanViewReports, CanManageEvent, GenerationStart, GenerationExpires, Active, GrantedBy, GrantedAt, RevokedAt, Notes`

The backend, not the browser, must enforce generation start/expiration and event scope.

There should be no lifetime voucher quota for an organizer. A backend may keep a technical per-request batch cap to protect Apps Script execution time.

## Event status

Recommended values: `Draft`, `Open`, `Closed`, `Archived`.

## Voucher claim expiration

Keep organizer generation expiration and recipient voucher claim expiration as separate fields/rules.

## Configuration access

Do not expose the ticket configuration interface publicly. Keep configuration in the private Google Sheet / Apps Script environment until an owner-only management interface is intentionally added.
