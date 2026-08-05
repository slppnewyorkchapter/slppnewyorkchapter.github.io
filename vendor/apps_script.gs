/**
 * SLPP NY — Voucher Claim API
 * ---------------------------------------------------
 * This turns a Google Sheet into a tiny live database for bulk-resale
 * vouchers: sellers get a batch of blank voucher links, hand them out as
 * they collect payment, and whoever taps a link first and submits their
 * name claims that ticket. No guest list needs to exist ahead of time.
 *
 * SHEET SETUP (one time):
 * 1. Create a new Google Sheet. Name it "SLPP NY Vouchers".
 * 2. Create a tab named exactly:  Vouchers
 *    with header row (row 1):
 *    Serial | Token | Tier | Price | Seller | Status | Name | Phone | ClaimedAt | CheckedInAt | Chapter
 * 3. Create a second tab named exactly:  Events
 *    with header row: Timestamp | Serial | Event | UA
 * 4. Use build_vouchers.py to generate your voucher batch, then paste the
 *    generated rows into the Vouchers tab (below the header, columns
 *    Serial through Seller — leave Status/Name/Phone/ClaimedAt/CheckedInAt
 *    blank; this script treats a blank Status as "unclaimed").
 *
 * DEPLOY (one time):
 * 1. In the Sheet: Extensions > Apps Script.
 * 2. Delete the starter code, paste this whole file in.
 * 3. Deploy > New deployment > type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Authorize when prompted. Copy the Web app URL (ends in /exec).
 * 5. Paste that URL into ticket.html as API_ENDPOINT.
 *
 * API:
 *   GET  ?action=lookup&s=SERIAL&t=TOKEN
 *        -> { ok, status: unclaimed|claimed|used|not_found|invalid_token,
 *             tier, price, name }
 *   POST { action:"claim", s, t, name, phone, chapter }
 *        -> { ok, status:"claimed", tier, price }  or
 *           { ok:false, error:"already_claimed", name }
 *   POST { action:"checkin", s, t }
 *        -> { ok, status:"used", name, tier }  or
 *           { ok:false, error:"already_used"|"not_claimed"|"invalid_token" }
 *        Note: t (token) is optional here. If provided (normal QR-scan
 *        path), it must match. If omitted, this is the gate volunteer's
 *        manual fallback for when a QR won't scan — the volunteer is
 *        expected to visually check the guest's ticket/ID in that case.
 *   POST { action:"uncheckin", s, t }
 *        -> { ok, status:"claimed" }   (undo an accidental check-in)
 *   POST { action:"recent", limit }
 *        -> { ok, recent:[{serial,name,tier,checkedInAt}, ...] }
 *        Live feed of the most recent check-ins, shared across every
 *        device running the gate tool.
 *   POST { action:"log", serial, event, ua }
 *        -> { ok:true }   (view/download analytics, best-effort)
 *   POST { action:"generate_batch", password, seller, tier, quantity }
 *        -> { ok, count, vouchers:[{serial, link}, ...] }  or
 *           { ok:false, error:"wrong_password"|"invalid_tier"|"invalid_quantity"|"seller_required" }
 *        Used by generate.html (the phone-friendly voucher generator).
 *        Password is never stored in this file — see setup step below.
 *   POST { action:"door_sale", password, name, phone, tier, chapter }
 *        -> { ok, serial, name, tier, price, link }  or
 *           { ok:false, error:"wrong_password"|"invalid_tier"|"name_required" }
 *        For walk-up guests at the gate with no pre-sold voucher. Creates
 *        a new ticket, claims it with the guest's name, and checks them
 *        in immediately — all in one action. Seller is always recorded
 *        as "Door (Walk-in)" so these are distinguishable in reporting.
 *        Same password gate as generate_batch, since this also creates
 *        real inventory on demand.
 *   POST { action:"get_seller_token", password, seller }
 *        -> { ok, seller, token, link }
 *        Mints (or returns the existing) dashboard token for a seller —
 *        this becomes their personal "My Vouchers" link (myvouchers.html).
 *        Password-gated, since only staff should hand out this credential.
 *        Calling this again for the same seller returns the SAME token,
 *        not a new one — it's meant to be handed out once.
 *   POST { action:"list_my_vouchers", seller, token }
 *        -> { ok, seller, vouchers:[{serial,tier,status,name,phone,
 *             claimedAt,canRelease,whyNot,link}, ...] }
 *        Public (no password) — authenticated by the seller's own token
 *        instead. Read-only view of everything allocated to that seller.
 *        `link` is only populated for still-unclaimed vouchers, so the
 *        seller can send it straight to their next buyer (see
 *        myvouchers.html's "Send via WhatsApp" button).
 *   POST { action:"release_claim", seller, token, serial, reason }
 *        -> { ok, serial }  or
 *           { ok:false, error:"not_your_voucher"|"too_old"|
 *             "too_close_to_event"|"already_checked_in"|"not_claimed"|
 *             "reason_required" }
 *        Lets a seller reset one of their OWN claimed-but-unpaid tickets
 *        back to unclaimed. Guardrails (see computeReleaseEligibility):
 *        only within RELEASE_WINDOW_HOURS of the claim, never inside
 *        RELEASE_CUTOFF_HOURS_BEFORE_EVENT of the event, and only with a
 *        reason on record (permanently logged to the Events sheet with
 *        the seller's name attached). Anything outside these bounds
 *        needs a manual edit by chapter staff directly in the Sheet.
 *
 * ONE MORE SETUP STEP for the password-gated generator:
 *   In the Apps Script editor: Project Settings (gear icon) > Script
 *   Properties > Add script property. Key: GEN_PASSWORD, Value: whatever
 *   passphrase you want to require before new vouchers can be generated
 *   from generate.html. This keeps the password out of any file you hand
 *   around or upload — it lives only in your own Apps Script project.
 *
 * ONE MORE SHEET TAB, for seller self-service release:
 *   Create a third tab named exactly: Sellers
 *   Header row: SellerName | Token | CreatedAt
 *   You don't fill this in yourself — it's populated automatically the
 *   first time you mint a dashboard link for each seller (see
 *   get_seller_token above / the Seller Dashboard tab in generate.html).
 */

var VOUCHER_SHEET = "Vouchers";
var EVENTS_SHEET = "Events";
var SELLERS_SHEET = "Sellers";

// Self-service "release a claim" guardrails (see handleReleaseClaim).
var RELEASE_WINDOW_HOURS = 48;           // must release within this long of the original claim
var EVENT_DATETIME = new Date("2026-09-05T20:00:00-04:00"); // doors, for the pre-event cutoff
var RELEASE_CUTOFF_HOURS_BEFORE_EVENT = 72; // no self-service release inside this window

// Column indexes (1-based) in the Vouchers sheet
var COL = { SERIAL:1, TOKEN:2, TIER:3, PRICE:4, SELLER:5, STATUS:6, NAME:7, PHONE:8, CLAIMED_AT:9, CHECKED_IN_AT:10, CHAPTER:11 };

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}

function getVoucherSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VOUCHER_SHEET);
}

function getSellersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SELLERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SELLERS_SHEET);
    sheet.appendRow(["SellerName", "Token", "CreatedAt"]);
  }
  return sheet;
}

function findSellerRow(sheet, sellerName) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === String(sellerName).trim().toLowerCase()) return i + 1;
  }
  return -1;
}

function findRowBySerial(sheet, serial) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.SERIAL - 1]).trim() === String(serial).trim()) return i + 1;
  }
  return -1;
}

function doGet(e) {
  var action = e.parameter.action;
  if (action === "lookup") return handleLookup(e.parameter.s, e.parameter.t);
  return jsonOut({ ok: false, error: "unknown_action" });
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }

  if (data.action === "claim")   return handleClaim(data);
  if (data.action === "checkin") return handleCheckin(data);
  if (data.action === "uncheckin") return handleUncheckin(data);
  if (data.action === "recent")  return handleRecent(data);
  if (data.action === "log")     return handleLog(data);
  if (data.action === "lookup")  return handleLookup(data.s, data.t); // gate tool convenience (POST)
  if (data.action === "generate_batch") return handleGenerateBatch(data);
  if (data.action === "door_sale") return handleDoorSale(data);
  if (data.action === "get_seller_token") return handleGetSellerToken(data);
  if (data.action === "list_my_vouchers") return handleListMyVouchers(data);
  if (data.action === "release_claim") return handleReleaseClaim(data);
  return jsonOut({ ok: false, error: "unknown_action" });
}

function handleLookup(serial, token) {
  if (!serial) return jsonOut({ ok: false, error: "missing_params" });
  var sheet = getVoucherSheet();
  var row = findRowBySerial(sheet, serial);
  if (row === -1) return jsonOut({ ok: false, error: "not_found" });

  var vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
  // Token is required for the guest-facing ticket page (always sends one).
  // It's optional here for the gate tool's manual-entry fallback.
  if (token && String(vals[COL.TOKEN - 1]) !== String(token)) {
    return jsonOut({ ok: false, error: "invalid_token" });
  }

  var status = vals[COL.STATUS - 1] || "unclaimed";
  return jsonOut({
    ok: true,
    status: status,
    tier: vals[COL.TIER - 1],
    price: vals[COL.PRICE - 1],
    name: vals[COL.NAME - 1] || null,
    chapter: vals[COL.CHAPTER - 1] || null
  });
}

function handleClaim(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000); // avoids two people claiming the same voucher at once
  try {
    var sheet = getVoucherSheet();
    var row = findRowBySerial(sheet, data.s);
    if (row === -1) return jsonOut({ ok: false, error: "not_found" });

    var vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
    if (String(vals[COL.TOKEN - 1]) !== String(data.t)) {
      return jsonOut({ ok: false, error: "invalid_token" });
    }

    var status = vals[COL.STATUS - 1] || "unclaimed";
    if (status === "claimed" || status === "used") {
      return jsonOut({ ok: false, error: "already_claimed", name: vals[COL.NAME - 1] });
    }

    var name = (data.name || "").toString().trim();
    if (!name) return jsonOut({ ok: false, error: "name_required" });

    var chapter = (data.chapter || "").toString().trim();

    sheet.getRange(row, COL.STATUS).setValue("claimed");
    sheet.getRange(row, COL.NAME).setValue(name);
    sheet.getRange(row, COL.PHONE).setValue((data.phone || "").toString().trim());
    sheet.getRange(row, COL.CLAIMED_AT).setValue(new Date());
    sheet.getRange(row, COL.CHAPTER).setValue(chapter);

    return jsonOut({
      ok: true,
      status: "claimed",
      tier: vals[COL.TIER - 1],
      price: vals[COL.PRICE - 1]
    });
  } finally {
    lock.releaseLock();
  }
}

function handleCheckin(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getVoucherSheet();
    var row = findRowBySerial(sheet, data.s);
    if (row === -1) return jsonOut({ ok: false, error: "not_found" });

    var vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
    // Token is required for a QR-scanned check-in. If the gate volunteer is
    // using the manual fallback (no camera / QR won't scan), data.t will be
    // empty and the token check is skipped — the volunteer is expected to
    // visually verify the guest's ticket/ID in that case.
    if (data.t && String(vals[COL.TOKEN - 1]) !== String(data.t)) {
      return jsonOut({ ok: false, error: "invalid_token" });
    }

    var status = vals[COL.STATUS - 1] || "unclaimed";
    if (status === "unclaimed") {
      return jsonOut({ ok: false, error: "not_claimed" });
    }
    if (status === "used") {
      return jsonOut({ ok: false, error: "already_used", name: vals[COL.NAME - 1],
                       checkedInAt: vals[COL.CHECKED_IN_AT - 1] });
    }

    sheet.getRange(row, COL.STATUS).setValue("used");
    sheet.getRange(row, COL.CHECKED_IN_AT).setValue(new Date());
    return jsonOut({
      ok: true, status: "used",
      name: vals[COL.NAME - 1], tier: vals[COL.TIER - 1], serial: vals[COL.SERIAL - 1]
    });
  } finally {
    lock.releaseLock();
  }
}

function handleUncheckin(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getVoucherSheet();
    var row = findRowBySerial(sheet, data.s);
    if (row === -1) return jsonOut({ ok: false, error: "not_found" });

    var vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
    if (data.t && String(vals[COL.TOKEN - 1]) !== String(data.t)) {
      return jsonOut({ ok: false, error: "invalid_token" });
    }

    var status = vals[COL.STATUS - 1] || "unclaimed";
    if (status !== "used") {
      return jsonOut({ ok: false, error: "not_checked_in" });
    }

    sheet.getRange(row, COL.STATUS).setValue("claimed");
    sheet.getRange(row, COL.CHECKED_IN_AT).setValue("");
    return jsonOut({ ok: true, status: "claimed", name: vals[COL.NAME - 1] });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns the most recently checked-in guests, for the gate volunteer's
 * "Recently checked in" panel (shared live across every device running
 * the check-in page, since it all reads the same Sheet).
 */
function handleRecent(data) {
  var sheet = getVoucherSheet();
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r[COL.STATUS - 1] === "used" && r[COL.CHECKED_IN_AT - 1]) {
      rows.push({
        serial: r[COL.SERIAL - 1], name: r[COL.NAME - 1], tier: r[COL.TIER - 1],
        chapter: r[COL.CHAPTER - 1] || "", seller: r[COL.SELLER - 1] || "",
        checkedInAt: new Date(r[COL.CHECKED_IN_AT - 1]).getTime()
      });
    }
  }
  rows.sort(function(a, b) { return b.checkedInAt - a.checkedInAt; });
  var limit = (data && data.limit) ? data.limit : 15;
  return jsonOut({ ok: true, recent: rows.slice(0, limit) });
}

/**
 * Generates a new batch of blank vouchers directly into the Vouchers
 * sheet, from the phone-friendly generate.html page. Password-gated
 * server-side via a Script Property (Project Settings > Script Properties
 * > key GEN_PASSWORD) — never stored in this file, so it isn't exposed
 * just because someone can read this source.
 */
var TIER_PREFIX = { single: "SGL", single_patron: "SGP", double_patron: "DBP" };
var TIER_PRICE  = { single: 100, single_patron: 200, double_patron: 300 };
var BASE_TICKET_URL = "https://slppnewyorkchapter.github.io/ticket.html";

function checkGeneratePassword(pw) {
  var expected = PropertiesService.getScriptProperties().getProperty("GEN_PASSWORD");
  return expected && pw && String(pw) === String(expected);
}

function randomToken() {
  // 10 hex characters, matching the format build_vouchers.py produces
  var bytes = [];
  for (var i = 0; i < 5; i++) bytes.push(Math.floor(Math.random() * 256));
  return bytes.map(function(b) { return ("0" + b.toString(16)).slice(-2); }).join("");
}

function findMaxSerialIndex(sheet, prefix) {
  var values = sheet.getDataRange().getValues();
  var max = 0;
  var re = new RegExp("^NY-" + prefix + "-(\\d+)$");
  for (var i = 1; i < values.length; i++) {
    var m = re.exec(String(values[i][COL.SERIAL - 1]).trim());
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

function handleGenerateBatch(data) {
  if (!checkGeneratePassword(data.password)) {
    return jsonOut({ ok: false, error: "wrong_password" });
  }

  var tier = data.tier;
  if (!TIER_PREFIX[tier]) return jsonOut({ ok: false, error: "invalid_tier" });

  var quantity = parseInt(data.quantity, 10);
  if (!quantity || quantity < 1 || quantity > 200) {
    return jsonOut({ ok: false, error: "invalid_quantity" });
  }

  var seller = (data.seller || "").toString().trim();
  if (!seller) return jsonOut({ ok: false, error: "seller_required" });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getVoucherSheet();
    var prefix = TIER_PREFIX[tier];
    var start = findMaxSerialIndex(sheet, prefix) + 1;
    var rows = [];
    var vouchers = [];

    for (var i = 0; i < quantity; i++) {
      var num = start + i;
      var serial = "NY-" + prefix + "-" + ("0000" + num).slice(-4);
      var token = randomToken();
      rows.push([serial, token, tier, TIER_PRICE[tier], seller, "", "", "", "", "", ""]);
      vouchers.push({
        serial: serial,
        link: BASE_TICKET_URL + "?s=" + encodeURIComponent(serial) + "&t=" + encodeURIComponent(token)
      });
    }

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return jsonOut({ ok: true, tier: tier, seller: seller, count: rows.length, vouchers: vouchers });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Registers a walk-up guest who pays at the gate without a pre-sold
 * voucher, and checks them in immediately — all in one action, all in
 * the same Sheet as every other ticket. Password-gated the same way as
 * handleGenerateBatch, since this also creates real inventory on demand.
 * The Seller column is set to "Door (Walk-in)" so these are always
 * distinguishable from seller-sold tickets in reporting.
 */
function handleDoorSale(data) {
  if (!checkGeneratePassword(data.password)) {
    return jsonOut({ ok: false, error: "wrong_password" });
  }

  var tier = data.tier;
  if (!TIER_PREFIX[tier]) return jsonOut({ ok: false, error: "invalid_tier" });

  var name = (data.name || "").toString().trim();
  if (!name) return jsonOut({ ok: false, error: "name_required" });

  var phone = (data.phone || "").toString().trim();
  var chapter = (data.chapter || "").toString().trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getVoucherSheet();
    var prefix = TIER_PREFIX[tier];
    var num = findMaxSerialIndex(sheet, prefix) + 1;
    var serial = "NY-" + prefix + "-" + ("0000" + num).slice(-4);
    var token = randomToken();
    var now = new Date();

    // Serial, Token, Tier, Price, Seller, Status, Name, Phone, ClaimedAt, CheckedInAt, Chapter
    var row = [serial, token, tier, TIER_PRICE[tier], "Door (Walk-in)", "used", name, phone, now, now, chapter];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

    return jsonOut({
      ok: true,
      serial: serial,
      name: name,
      tier: tier,
      price: TIER_PRICE[tier],
      chapter: chapter,
      link: BASE_TICKET_URL + "?s=" + encodeURIComponent(serial) + "&t=" + encodeURIComponent(token)
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mints (or returns the existing) dashboard token for a seller — this is
 * what turns into their personal "My Vouchers" link. Password-gated with
 * the same GEN_PASSWORD as batch generation, since only staff should be
 * handing out a seller's dashboard credential.
 */
function handleGetSellerToken(data) {
  if (!checkGeneratePassword(data.password)) {
    return jsonOut({ ok: false, error: "wrong_password" });
  }
  var sellerName = (data.seller || "").toString().trim();
  if (!sellerName) return jsonOut({ ok: false, error: "seller_required" });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSellersSheet();
    var row = findSellerRow(sheet, sellerName);
    var token;
    if (row === -1) {
      token = randomToken() + randomToken(); // extra-long token for a durable, reusable link
      sheet.appendRow([sellerName, token, new Date()]);
    } else {
      token = sheet.getRange(row, 2).getValue();
    }
    return jsonOut({
      ok: true,
      seller: sellerName,
      token: token,
      link: "https://slppnewyorkchapter.github.io/myvouchers.html?seller=" +
        encodeURIComponent(sellerName) + "&token=" + encodeURIComponent(token)
    });
  } finally {
    lock.releaseLock();
  }
}

function verifySellerToken(sellerName, token) {
  var sheet = getSellersSheet();
  var row = findSellerRow(sheet, sellerName);
  if (row === -1) return false;
  return String(sheet.getRange(row, 2).getValue()) === String(token);
}

/**
 * Computes whether a claimed-but-not-yet-checked-in voucher is still
 * within the self-service release window. Shared between the read-only
 * list view and the actual release action, so they never disagree.
 */
function computeReleaseEligibility(status, claimedAt) {
  if (status !== "claimed") return { canRelease: false, whyNot: status === "used" ? "already_checked_in" : "not_claimed" };

  var now = new Date();
  var claimedDate = claimedAt ? new Date(claimedAt) : null;
  if (!claimedDate || isNaN(claimedDate.getTime())) return { canRelease: false, whyNot: "unknown_claim_time" };

  var hoursSinceClaim = (now.getTime() - claimedDate.getTime()) / 36e5;
  if (hoursSinceClaim > RELEASE_WINDOW_HOURS) return { canRelease: false, whyNot: "too_old" };

  var cutoff = new Date(EVENT_DATETIME.getTime() - RELEASE_CUTOFF_HOURS_BEFORE_EVENT * 36e5);
  if (now.getTime() > cutoff.getTime()) return { canRelease: false, whyNot: "too_close_to_event" };

  return { canRelease: true, whyNot: null };
}

/**
 * Read-only dashboard data for a seller: every voucher allocated to them,
 * with a canRelease flag computed per-row so the page can show/hide the
 * Release button without duplicating the time-window logic client-side.
 */
function handleListMyVouchers(data) {
  var sellerName = (data.seller || "").toString().trim();
  var token = (data.token || "").toString().trim();
  if (!sellerName || !token) return jsonOut({ ok: false, error: "missing_params" });
  if (!verifySellerToken(sellerName, token)) return jsonOut({ ok: false, error: "invalid_token" });

  var sheet = getVoucherSheet();
  var values = sheet.getDataRange().getValues();
  var vouchers = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[COL.SELLER - 1]).trim().toLowerCase() !== sellerName.toLowerCase()) continue;
    var status = r[COL.STATUS - 1] || "unclaimed";
    var claimedAt = r[COL.CLAIMED_AT - 1];
    var elig = computeReleaseEligibility(status, claimedAt);
    vouchers.push({
      serial: r[COL.SERIAL - 1],
      tier: r[COL.TIER - 1],
      status: status,
      name: r[COL.NAME - 1] || null,
      phone: r[COL.PHONE - 1] || null,
      claimedAt: claimedAt ? new Date(claimedAt).getTime() : null,
      canRelease: elig.canRelease,
      whyNot: elig.whyNot,
      link: status === "unclaimed"
        ? (BASE_TICKET_URL + "?s=" + encodeURIComponent(r[COL.SERIAL - 1]) + "&t=" + encodeURIComponent(r[COL.TOKEN - 1]))
        : null
    });
  }
  return jsonOut({ ok: true, seller: sellerName, vouchers: vouchers });
}

/**
 * Lets a seller reset one of their own claimed-but-unpaid tickets back to
 * unclaimed, within guardrails: only within RELEASE_WINDOW_HOURS of the
 * original claim, never inside RELEASE_CUTOFF_HOURS_BEFORE_EVENT of the
 * event itself, only on vouchers actually allocated to them, and only
 * with a reason on record. Anything outside these bounds must go through
 * the chapter directly (manual edit in the Sheet).
 */
function handleReleaseClaim(data) {
  var sellerName = (data.seller || "").toString().trim();
  var token = (data.token || "").toString().trim();
  var serial = (data.serial || "").toString().trim();
  var reason = (data.reason || "").toString().trim();

  if (!sellerName || !token) return jsonOut({ ok: false, error: "missing_params" });
  if (!verifySellerToken(sellerName, token)) return jsonOut({ ok: false, error: "invalid_token" });
  if (!reason) return jsonOut({ ok: false, error: "reason_required" });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getVoucherSheet();
    var row = findRowBySerial(sheet, serial);
    if (row === -1) return jsonOut({ ok: false, error: "not_found" });

    var vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
    if (String(vals[COL.SELLER - 1]).trim().toLowerCase() !== sellerName.toLowerCase()) {
      return jsonOut({ ok: false, error: "not_your_voucher" });
    }

    var status = vals[COL.STATUS - 1] || "unclaimed";
    var elig = computeReleaseEligibility(status, vals[COL.CLAIMED_AT - 1]);
    if (!elig.canRelease) return jsonOut({ ok: false, error: elig.whyNot });

    var releasedGuestName = vals[COL.NAME - 1];

    sheet.getRange(row, COL.STATUS).setValue("");
    sheet.getRange(row, COL.NAME).setValue("");
    sheet.getRange(row, COL.PHONE).setValue("");
    sheet.getRange(row, COL.CLAIMED_AT).setValue("");
    sheet.getRange(row, COL.CHAPTER).setValue("");

    // Permanent record of who released what, and why — even though the
    // reason itself isn't verified, this closes off the quiet/deniable
    // version of misuse: every release is timestamped and attributed.
    var eventsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS_SHEET) ||
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(EVENTS_SHEET);
    if (eventsSheet.getLastRow() === 0) eventsSheet.appendRow(["Timestamp", "Serial", "Event", "UA"]);
    eventsSheet.appendRow([
      new Date(), serial, "release",
      "seller=" + sellerName + "; released_guest=" + releasedGuestName + "; reason=" + reason
    ]);

    return jsonOut({ ok: true, serial: serial });
  } finally {
    lock.releaseLock();
  }
}

function handleLog(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVENTS_SHEET) || ss.insertSheet(EVENTS_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(["Timestamp", "Serial", "Event", "User Agent"]);
  sheet.appendRow([new Date(), data.serial || "", data.event || "", data.ua || ""]);
  return jsonOut({ ok: true });
}
