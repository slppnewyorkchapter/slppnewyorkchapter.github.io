/* SLPP North America Regional Ticket Master Renderer v2
 * Browser-only Canvas renderer for GitHub Pages.
 * Requires qrcode.min.js (QRCode library) for QR generation.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    width: 2400,
    height: 800,
    stubWidth: 390,
    palette: {
      green: '#0b3d24',
      greenDeep: '#082c19',
      gold: '#c9a24b',
      goldLight: '#e8d39a',
      cream: '#faf7ef',
      ink: '#171717',
      blue: '#172a73',
      muted: '#6f6a60'
    },
    fonts: {
      sans: 'Arial, Helvetica, sans-serif',
      serif: 'Georgia, Times New Roman, serif'
    }
  };

  const money = (value, currency = 'USD') => {
    const n = Number(value || 0);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency, maximumFractionDigits: Number.isInteger(n) ? 0 : 2
      }).format(n);
    } catch (_) {
      return '$' + n.toFixed(Number.isInteger(n) ? 0 : 2);
    }
  };

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function fitText(ctx, text, maxWidth, startSize, minSize, family, weight = '700') {
    let size = startSize;
    while (size > minSize) {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
    return size;
  }

  function drawCentered(ctx, text, x, y, options = {}) {
    const { family = DEFAULTS.fonts.sans, size = 40, weight = '700', color = '#000', maxWidth = null } = options;
    const finalSize = maxWidth ? fitText(ctx, text, maxWidth, size, 16, family, weight) : size;
    ctx.save();
    ctx.font = `${weight} ${finalSize}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
    return finalSize;
  }

  function drawLeft(ctx, text, x, y, options = {}) {
    const { family = DEFAULTS.fonts.sans, size = 36, weight = '600', color = '#000', maxWidth = null } = options;
    const finalSize = maxWidth ? fitText(ctx, text, maxWidth, size, 14, family, weight) : size;
    ctx.save();
    ctx.font = `${weight} ${finalSize}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
    return finalSize;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
    const { family = DEFAULTS.fonts.sans, size = 28, weight = '400', color = '#000', maxLines = 3 } = options;
    ctx.save();
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
    ctx.restore();
    return lines.length;
  }

  async function loadImage(src) {
    if (!src) return null;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image: ${src}`));
      img.src = src;
    });
  }

  function drawImageContain(ctx, img, x, y, w, h, alpha = 1) {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawImageCover(ctx, img, x, y, w, h, alpha = 1) {
    if (!img) return;
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }

  function drawOrnamentLine(ctx, x1, x2, y, gold) {
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc((x1 + x2) / 2, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPerforation(ctx, x, h) {
    ctx.save();
    ctx.strokeStyle = '#7f7a70';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 10]);
    ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, h - 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBadge(ctx, x, y, w, h, ticket, palette, fonts) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, 38);
    ctx.fillStyle = ticket.badgeColor || palette.greenDeep;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = palette.gold;
    ctx.stroke();
    roundedRect(ctx, x + 12, y + 12, w - 24, h - 24, 30);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.goldLight;
    ctx.stroke();
    drawCentered(ctx, String(ticket.label || ticket.tierLabel || 'ADMISSION').toUpperCase(), x + w / 2, y + 100,
      { family: fonts.serif, size: 50, weight: '700', color: '#fff', maxWidth: w - 50 });
    drawOrnamentLine(ctx, x + 45, x + w - 45, y + 148, palette.gold);
    drawCentered(ctx, money(ticket.price, ticket.currency), x + w / 2, y + 225,
      { family: fonts.serif, size: 78, weight: '700', color: palette.goldLight, maxWidth: w - 40 });
    drawOrnamentLine(ctx, x + 45, x + w - 45, y + 290, palette.gold);
    const admitCount = Number(ticket.admitCount || 1);
    drawCentered(ctx, admitCount === 1 ? 'ADMIT ONE' : admitCount === 2 ? 'ADMIT TWO' : `ADMIT ${admitCount}`, x + w / 2, y + 340,
      { family: fonts.serif, size: 34, weight: '700', color: '#fff', maxWidth: w - 50 });
    ctx.restore();
  }

  function drawInfoIcon(ctx, cx, cy, type, palette) {
    ctx.save();
    ctx.fillStyle = palette.green;
    ctx.beginPath(); ctx.arc(cx, cy, 25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3;
    if (type === 'calendar') {
      ctx.strokeRect(cx - 12, cy - 9, 24, 18);
      ctx.beginPath(); ctx.moveTo(cx - 12, cy - 3); ctx.lineTo(cx + 12, cy - 3); ctx.stroke();
    } else if (type === 'clock') {
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 8); ctx.moveTo(cx, cy); ctx.lineTo(cx + 7, cy + 5); ctx.stroke();
    } else if (type === 'pin') {
      ctx.beginPath(); ctx.arc(cx, cy - 5, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 6, cy + 2); ctx.lineTo(cx, cy + 14); ctx.lineTo(cx + 6, cy + 2); ctx.stroke();
    } else if (type === 'dress') {
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 9); ctx.lineTo(cx, cy); ctx.lineTo(cx - 14, cy + 9); ctx.closePath();
      ctx.moveTo(cx + 14, cy - 9); ctx.lineTo(cx, cy); ctx.lineTo(cx + 14, cy + 9); ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = palette.goldLight; ctx.fill();
    }
    ctx.restore();
  }

  async function makeQrCanvas(text, size = 240) {
    if (!text) return null;
    if (!global.QRCode) throw new Error('QRCode library is not loaded. Include qrcode.min.js before ticket-renderer.js.');
    const holder = document.createElement('div');
    holder.style.position = 'fixed'; holder.style.left = '-9999px'; holder.style.top = '-9999px';
    document.body.appendChild(holder);
    new global.QRCode(holder, { text, width: size, height: size, correctLevel: global.QRCode.CorrectLevel.H });
    await new Promise(r => setTimeout(r, 30));
    const canvas = holder.querySelector('canvas');
    const img = holder.querySelector('img');
    let result = null;
    if (canvas) {
      result = document.createElement('canvas'); result.width = size; result.height = size;
      result.getContext('2d').drawImage(canvas, 0, 0, size, size);
    } else if (img) {
      const loaded = await loadImage(img.src);
      result = document.createElement('canvas'); result.width = size; result.height = size;
      result.getContext('2d').drawImage(loaded, 0, 0, size, size);
    }
    holder.remove();
    return result;
  }

  function normalizeConfig(input) {
    const chapter = input.chapter || {};
    const event = input.event || {};
    const ticket = input.ticket || input.tier || {};
    return {
      chapter: {
        code: chapter.code || chapter.chapterCode || '',
        name: chapter.name || chapter.chapterName || 'Chapter',
        logoUrl: chapter.logoUrl || chapter.logo || '',
        skylineUrl: chapter.skylineUrl || chapter.skylineImage || '',
        website: chapter.website || '',
        contactPhone: chapter.contactPhone || chapter.phone || '',
        primaryColor: chapter.primaryColor || DEFAULTS.palette.green,
        secondaryColor: chapter.secondaryColor || DEFAULTS.palette.gold,
        serialPrefix: chapter.serialPrefix || chapter.code || 'TK'
      },
      event: {
        id: event.id || event.eventId || '',
        name: event.name || event.eventName || 'Event',
        subtitle: event.subtitle || event.subheading || '',
        dateDisplay: event.dateDisplay || event.eventDateDisplay || event.date || event.eventDate || '',
        timeDisplay: event.timeDisplay || event.eventTime || event.time || '',
        venue: event.venue || '',
        address: event.address || '',
        dressCode: event.dressCode || 'FORMAL / TRADITIONAL',
        footerNotice: event.footerNotice || 'Ticket must be presented for admission',
        refundNotice: event.refundNotice || 'No refunds or replacements'
      },
      ticket: {
        code: ticket.code || ticket.tierCode || '',
        label: ticket.label || ticket.tierLabel || ticket.name || 'Admission',
        price: Number(ticket.price || 0),
        currency: ticket.currency || 'USD',
        admitCount: Number(ticket.admitCount || 1),
        serial: ticket.serial || '',
        qrValue: ticket.qrValue || ticket.validationUrl || ticket.serial || '',
        badgeColor: ticket.badgeColor || chapter.primaryColor || DEFAULTS.palette.greenDeep
      }
    };
  }

  async function render(canvas, input, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('A canvas element is required.');
    const cfg = normalizeConfig(input);
    const W = options.width || DEFAULTS.width;
    const H = options.height || DEFAULTS.height;
    const stubW = options.stubWidth || DEFAULTS.stubWidth;
    const mainW = W - stubW;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const palette = { ...DEFAULTS.palette, green: cfg.chapter.primaryColor, gold: cfg.chapter.secondaryColor };
    const fonts = DEFAULTS.fonts;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = palette.cream; ctx.fillRect(0, 0, W, H);

    // subtle paper security pattern
    ctx.save(); ctx.globalAlpha = 0.035; ctx.strokeStyle = palette.green; ctx.lineWidth = 1;
    for (let y = 15; y < H; y += 18) {
      ctx.beginPath();
      for (let x = 0; x < W; x += 12) {
        const yy = y + Math.sin(x / 24) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // borders
    ctx.strokeStyle = palette.gold; ctx.lineWidth = 5; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.strokeStyle = palette.green; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32);

    const [logoImg, skylineImg] = await Promise.all([
      loadImage(cfg.chapter.logoUrl).catch(() => null),
      loadImage(cfg.chapter.skylineUrl).catch(() => null)
    ]);

    // watermark
    ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = palette.green; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(570, 280, 155, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(570, 280, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // logo or chapter monogram
    if (logoImg) drawImageContain(ctx, logoImg, 55, 45, 270, 240, 1);
    else {
      ctx.save(); ctx.fillStyle = palette.green; ctx.beginPath(); ctx.arc(175, 155, 95, 0, Math.PI * 2); ctx.fill();
      drawCentered(ctx, cfg.chapter.code || 'SLPP', 175, 155, { size: 50, weight: '700', color: '#fff' }); ctx.restore();
    }

    // headings
    drawCentered(ctx, 'SLPP NORTH AMERICA', 950, 64, { size: 38, weight: '700', color: palette.green, maxWidth: 700 });
    drawOrnamentLine(ctx, 635, 760, 64, palette.gold);
    drawOrnamentLine(ctx, 1140, 1265, 64, palette.gold);
    drawCentered(ctx, cfg.chapter.name.toUpperCase(), 950, 132, { family: fonts.serif, size: 68, weight: '700', color: palette.greenDeep, maxWidth: 1150 });
    drawOrnamentLine(ctx, 540, 1360, 182, palette.gold);
    drawCentered(ctx, cfg.event.name.toUpperCase(), 950, 235, { family: fonts.serif, size: 52, weight: '700', color: palette.gold, maxWidth: 1250 });
    if (cfg.event.subtitle) {
      drawCentered(ctx, cfg.event.subtitle, 950, 286, { family: fonts.serif, size: 25, weight: '400', color: palette.blue, maxWidth: 1150 });
    }

    // info column
    const infoX = 130, textX = 190;
    drawInfoIcon(ctx, infoX, 355, 'calendar', palette);
    drawLeft(ctx, cfg.event.dateDisplay, textX, 355, { size: 25, weight: '700', color: palette.blue, maxWidth: 420 });
    drawInfoIcon(ctx, infoX, 425, 'clock', palette);
    drawLeft(ctx, cfg.event.timeDisplay, textX, 425, { size: 27, weight: '700', color: palette.blue, maxWidth: 360 });
    drawInfoIcon(ctx, infoX, 495, 'pin', palette);
    drawLeft(ctx, cfg.event.venue, textX, 485, { size: 25, weight: '700', color: palette.blue, maxWidth: 430 });
    wrapText(ctx, cfg.event.address, textX, 512, 450, 27, { size: 19, color: palette.ink, maxLines: 2 });
    drawInfoIcon(ctx, infoX, 590, 'dress', palette);
    drawLeft(ctx, 'DRESS CODE:', textX, 580, { size: 20, weight: '700', color: palette.ink });
    drawLeft(ctx, cfg.event.dressCode, textX, 610, { size: 22, weight: '700', color: palette.ink, maxWidth: 390 });

    // skyline centered behind lower ticket body
    if (skylineImg) {
      drawImageContain(ctx, skylineImg, 440, 300, 1110, 325, 0.62);
    }

    // main ticket badge
    drawBadge(ctx, mainW - 380, 135, 310, 405, cfg.ticket, palette, fonts);

    // serial plaque on main ticket
    roundedRect(ctx, mainW - 310, 575, 220, 55, 10);
    ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = palette.gold; ctx.stroke();
    drawCentered(ctx, cfg.ticket.serial || `${cfg.chapter.serialPrefix}-000`, mainW - 200, 603, { size: 29, weight: '700', color: palette.greenDeep });

    // footer bar
    ctx.fillStyle = palette.greenDeep; ctx.fillRect(18, 650, mainW - 36, 130);
    ctx.fillStyle = palette.gold; ctx.fillRect(18, 648, mainW - 36, 4);
    drawLeft(ctx, 'FOR MORE INFO:', 155, 688, { size: 19, weight: '700', color: palette.goldLight });
    drawLeft(ctx, cfg.chapter.website || '—', 155, 721, { size: 18, weight: '400', color: '#fff', maxWidth: 455 });
    drawLeft(ctx, 'CONTACT:', 720, 688, { size: 19, weight: '700', color: palette.goldLight });
    drawLeft(ctx, cfg.chapter.contactPhone || '—', 720, 721, { size: 20, weight: '400', color: '#fff' });
    wrapText(ctx, cfg.event.footerNotice, 1090, 684, 300, 27, { size: 18, color: '#fff', maxLines: 2 });
    wrapText(ctx, cfg.event.refundNotice, 1480, 684, 255, 27, { size: 18, color: '#fff', maxLines: 2 });

    // stub
    const sx = mainW;
    drawPerforation(ctx, sx, H);
    ctx.fillStyle = palette.greenDeep; ctx.fillRect(sx + 6, 18, stubW - 24, 92);
    drawCentered(ctx, 'ADMISSION STUB', sx + stubW / 2, 64, { size: 30, weight: '700', color: '#fff', maxWidth: stubW - 70 });
    drawCentered(ctx, String(cfg.ticket.label).toUpperCase(), sx + stubW / 2, 160, { family: fonts.serif, size: 40, weight: '700', color: palette.green, maxWidth: stubW - 70 });
    drawCentered(ctx, money(cfg.ticket.price, cfg.ticket.currency), sx + stubW / 2, 235, { family: fonts.serif, size: 62, weight: '700', color: palette.gold, maxWidth: stubW - 70 });
    drawCentered(ctx, Number(cfg.ticket.admitCount) === 1 ? 'ADMIT ONE' : Number(cfg.ticket.admitCount) === 2 ? 'ADMIT TWO' : `ADMIT ${cfg.ticket.admitCount}`, sx + stubW / 2, 300, { size: 28, weight: '700', color: palette.ink });

    const qrCanvas = await makeQrCanvas(cfg.ticket.qrValue, 220).catch(() => null);
    if (qrCanvas) {
      ctx.fillStyle = '#fff'; ctx.fillRect(sx + (stubW - 245) / 2, 345, 245, 245);
      ctx.drawImage(qrCanvas, sx + (stubW - 220) / 2, 357, 220, 220);
    } else {
      ctx.strokeStyle = palette.gold; ctx.lineWidth = 3; ctx.strokeRect(sx + 80, 355, stubW - 160, 210);
      drawCentered(ctx, 'QR', sx + stubW / 2, 460, { size: 52, color: palette.muted });
    }

    roundedRect(ctx, sx + 55, 625, stubW - 110, 88, 16);
    ctx.fillStyle = palette.greenDeep; ctx.fill(); ctx.strokeStyle = palette.gold; ctx.lineWidth = 3; ctx.stroke();
    drawCentered(ctx, cfg.ticket.serial || `${cfg.chapter.serialPrefix}-000`, sx + stubW / 2, 669, { size: 38, weight: '700', color: '#fff', maxWidth: stubW - 135 });

    return canvas;
  }

  function download(canvas, filename = 'ticket.png') {
    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  async function toBlob(canvas, type = 'image/png', quality = 0.95) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  global.SLPPTicketRenderer = { render, download, toBlob, normalizeConfig, money, defaults: DEFAULTS };
})(window);
