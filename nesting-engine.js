/* CutPlan multi-start MaxRects nesting engine.
 * This is a heuristic 2D rectangle packer, not a proof of global optimality.
 * Parts are expanded on their trailing/right and bottom sides by the kerf to
 * reserve conservative cutting clearance. The drawing uses the true part size.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CutPlanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-7;
  const ORDERINGS = ['area', 'longSide', 'shortSide', 'perimeter', 'width', 'height', 'aspect', 'input'];
  const SCORERS = ['bssf', 'baf', 'blsf', 'contact'];

  function number(value, label, min = 0) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min) throw new Error(`${label} must be a number greater than or equal to ${min}.`);
    return n;
  }

  function expandRows(rows) {
    const items = [];
    const seenIds = new Set();
    rows.forEach((row, index) => {
      const rowId = String(row.rowId ?? index + 1).trim();
      if (!rowId) throw new Error(`Row ${index + 1} needs a reference number.`);
      if (seenIds.has(rowId)) throw new Error(`Duplicate row reference #${rowId}. Each cutting-list row must have a unique reference.`);
      seenIds.add(rowId);
      const length = number(row.length, `Row #${rowId} length`, 0.001);
      const width = number(row.width, `Row #${rowId} width`, 0.001);
      const qty = number(row.qty, `Row #${rowId} quantity`, 1);
      if (!Number.isInteger(qty)) throw new Error(`Row #${rowId} quantity must be a whole number.`);
      if (length > 100000 || width > 100000 || qty > 10000) throw new Error(`Row #${rowId} contains an unusually large value. Check the data.`);
      for (let unit = 1; unit <= qty; unit++) {
        items.push({
          rowId,
          unit,
          rowQty: qty,
          length,
          width,
          rotate: Boolean(row.rotate),
          inputIndex: index,
          area: length * width,
          maxSide: Math.max(length, width),
          minSide: Math.min(length, width),
          perimeter: 2 * (length + width),
          aspect: Math.max(length, width) / Math.min(length, width)
        });
      }
    });
    if (!items.length) throw new Error('Add at least one valid cutting-list row.');
    return items;
  }

  function intersects(a, b) {
    return !(b.x >= a.x + a.w - EPS || b.x + b.w <= a.x + EPS ||
      b.y >= a.y + a.h - EPS || b.y + b.h <= a.y + EPS);
  }

  function splitFreeRectangles(freeRects, used) {
    const out = [];
    for (const f of freeRects) {
      if (!intersects(f, used)) {
        out.push(f);
        continue;
      }
      // Top and bottom strips.
      if (used.y > f.y + EPS && used.y < f.y + f.h - EPS) {
        out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      }
      if (used.y + used.h < f.y + f.h - EPS && used.y + used.h > f.y + EPS) {
        out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
      }
      // Left and right strips.
      if (used.x > f.x + EPS && used.x < f.x + f.w - EPS) {
        out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      }
      if (used.x + used.w < f.x + f.w - EPS && used.x + used.w > f.x + EPS) {
        out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
      }
    }
    return pruneFreeRectangles(out);
  }

  function pruneFreeRectangles(rects) {
    const clean = rects.filter(r => r.w > EPS && r.h > EPS);
    for (let i = 0; i < clean.length; i++) {
      for (let j = i + 1; j < clean.length; j++) {
        const a = clean[i], b = clean[j];
        const aContainsB = b.x >= a.x - EPS && b.y >= a.y - EPS &&
          b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
        const bContainsA = a.x >= b.x - EPS && a.y >= b.y - EPS &&
          a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS;
        if (aContainsB) {
          clean.splice(j, 1); j--;
        } else if (bContainsA) {
          clean.splice(i, 1); i--; break;
        }
      }
    }
    return clean;
  }

  function sortedItems(items, ordering, variant) {
    const list = items.slice();
    const sign = variant % 2 === 0 ? -1 : 1;
    const secondarySign = variant % 3 === 0 ? 1 : -1;
    const cmpDesc = (a, b, key) => (b[key] - a[key]) * sign;
    list.sort((a, b) => {
      let v = 0;
      switch (ordering) {
        case 'area': v = cmpDesc(a, b, 'area'); break;
        case 'longSide': v = cmpDesc(a, b, 'maxSide'); break;
        case 'shortSide': v = cmpDesc(a, b, 'minSide'); break;
        case 'perimeter': v = cmpDesc(a, b, 'perimeter'); break;
        case 'width': v = cmpDesc(a, b, 'width') || cmpDesc(a, b, 'length'); break;
        case 'height': v = cmpDesc(a, b, 'length') || cmpDesc(a, b, 'width'); break;
        case 'aspect': v = cmpDesc(a, b, 'aspect') || cmpDesc(a, b, 'area'); break;
        case 'input': v = (a.inputIndex - b.inputIndex) * sign || (a.unit - b.unit) * secondarySign; break;
      }
      if (!v) v = (b.area - a.area) * secondarySign || (a.inputIndex - b.inputIndex) || a.unit - b.unit;
      return v;
    });
    return list;
  }

  function contactScore(sheet, x, y, reserveW, reserveH, bounds) {
    let score = 0;
    if (Math.abs(x - bounds.x) < EPS) score += reserveH;
    if (Math.abs(y - bounds.y) < EPS) score += reserveW;
    if (Math.abs(x + reserveW - (bounds.x + bounds.w)) < EPS) score += reserveH;
    if (Math.abs(y + reserveH - (bounds.y + bounds.h)) < EPS) score += reserveW;
    for (const p of sheet.placed) {
      const r = p.reserve;
      if (Math.abs(r.x + r.w - x) < EPS || Math.abs(x + reserveW - r.x) < EPS) {
        score += Math.max(0, Math.min(y + reserveH, r.y + r.h) - Math.max(y, r.y));
      }
      if (Math.abs(r.y + r.h - y) < EPS || Math.abs(y + reserveH - r.y) < EPS) {
        score += Math.max(0, Math.min(x + reserveW, r.x + r.w) - Math.max(x, r.x));
      }
    }
    return score;
  }

  function compareScore(a, b) {
    if (!b) return -1;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i];
    }
    return 0;
  }

  function scoreCandidate(free, reserveW, reserveH, scorer, contact) {
    const dw = Math.max(0, free.w - reserveW);
    const dh = Math.max(0, free.h - reserveH);
    switch (scorer) {
      case 'baf': return [free.w * free.h - reserveW * reserveH, Math.min(dw, dh), Math.max(dw, dh), free.y, free.x];
      case 'blsf': return [Math.max(dw, dh), Math.min(dw, dh), free.w * free.h - reserveW * reserveH, free.y, free.x];
      case 'contact': return [-contact, Math.min(dw, dh), Math.max(dw, dh), free.y, free.x];
      case 'bssf':
      default: return [Math.min(dw, dh), Math.max(dw, dh), free.w * free.h - reserveW * reserveH, free.y, free.x];
    }
  }

  function findBestPlacement(sheets, item, cfg, scorer) {
    let best = null;
    const orientations = [{ w: item.length, h: item.width, rotated: false }];
    if (item.rotate && Math.abs(item.length - item.width) > EPS) {
      orientations.push({ w: item.width, h: item.length, rotated: true });
    }
    for (let si = 0; si < sheets.length; si++) {
      const sheet = sheets[si];
      for (let fi = 0; fi < sheet.free.length; fi++) {
        const f = sheet.free[fi];
        for (const o of orientations) {
          if (o.w > f.w + EPS || o.h > f.h + EPS) continue;
          const touchesRight = Math.abs((f.x + o.w) - (cfg.sheetLength - cfg.margin)) < EPS;
          const touchesBottom = Math.abs((f.y + o.h) - (cfg.sheetWidth - cfg.margin)) < EPS;
          const reserveW = o.w + (touchesRight ? 0 : cfg.kerf);
          const reserveH = o.h + (touchesBottom ? 0 : cfg.kerf);
          if (reserveW > f.w + EPS || reserveH > f.h + EPS) continue;
          const contact = contactScore(sheet, f.x, f.y, reserveW, reserveH, cfg.bounds);
          const score = scoreCandidate(f, reserveW, reserveH, scorer, contact);
          const candidate = { si, fi, x: f.x, y: f.y, w: o.w, h: o.h,
            reserveW, reserveH, rotated: o.rotated, score };
          if (!best || compareScore(score, best.score) < 0) best = candidate;
        }
      }
    }
    return best;
  }

  function createSheet(cfg) {
    return {
      free: [{ x: cfg.margin, y: cfg.margin, w: cfg.usableWidth, h: cfg.usableHeight }],
      placed: []
    };
  }

  function runPacking(items, cfg, ordering, scorer, variant) {
    const ordered = sortedItems(items, ordering, variant);
    const sheets = [];
    for (const item of ordered) {
      let fit = findBestPlacement(sheets, item, cfg, scorer);
      if (!fit) {
        const orientations = [{ w: item.length, h: item.width }];
        if (item.rotate && Math.abs(item.length - item.width) > EPS) orientations.push({ w: item.width, h: item.length });
        const canFit = orientations.some(o => o.w <= cfg.usableWidth + EPS && o.h <= cfg.usableHeight + EPS);
        if (!canFit) {
          throw new Error(`Row #${item.rowId} (${item.length} × ${item.width} mm) cannot fit on the usable sheet, even when rotated.`);
        }
        sheets.push(createSheet(cfg));
        fit = findBestPlacement(sheets, item, cfg, scorer);
        if (!fit) throw new Error(`The optimizer could not place row #${item.rowId}. Check the sheet size, margin and kerf.`);
      }
      const sheet = sheets[fit.si];
      const reserve = { x: fit.x, y: fit.y, w: fit.reserveW, h: fit.reserveH };
      sheet.free = splitFreeRectangles(sheet.free, reserve);
      sheet.placed.push({
        rowId: item.rowId,
        unit: item.unit,
        rowQty: item.rowQty,
        length: item.length,
        width: item.width,
        x: fit.x,
        y: fit.y,
        w: fit.w,
        h: fit.h,
        reserve,
        rotated: fit.rotated
      });
    }
    return sheets;
  }

  function layoutQuality(sheets, margin) {
    let boundingArea = 0;
    let freeCount = 0;
    let maxRight = 0;
    let maxBottom = 0;
    for (const sheet of sheets) {
      let right = margin, bottom = margin;
      for (const p of sheet.placed) {
        right = Math.max(right, p.reserve.x + p.reserve.w);
        bottom = Math.max(bottom, p.reserve.y + p.reserve.h);
      }
      maxRight = Math.max(maxRight, right);
      maxBottom = Math.max(maxBottom, bottom);
      boundingArea += Math.max(0, right - margin) * Math.max(0, bottom - margin);
      freeCount += sheet.free.length;
    }
    return { boundingArea, freeCount, maxRight, maxBottom };
  }

  function isBetter(candidate, best) {
    if (!best) return true;
    if (candidate.sheets.length !== best.sheets.length) return candidate.sheets.length < best.sheets.length;
    if (Math.abs(candidate.quality.boundingArea - best.quality.boundingArea) > EPS) {
      return candidate.quality.boundingArea < best.quality.boundingArea;
    }
    if (candidate.quality.freeCount !== best.quality.freeCount) return candidate.quality.freeCount < best.quality.freeCount;
    return candidate.ordering + candidate.scorer < best.ordering + best.scorer;
  }

  function validateLayout(sheets, kerf) {
    let count = 0;
    for (let si = 0; si < sheets.length; si++) {
      const placed = sheets[si].placed;
      count += placed.length;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j];
          const actualOverlap = a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
            a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
          if (actualOverlap) throw new Error(`Internal validation failed: rows #${a.rowId} and #${b.rowId} overlap on sheet ${si + 1}.`);
          const reserveOverlap = a.reserve.x < b.reserve.x + b.reserve.w - EPS && a.reserve.x + a.reserve.w > b.reserve.x + EPS &&
            a.reserve.y < b.reserve.y + b.reserve.h - EPS && a.reserve.y + a.reserve.h > b.reserve.y + EPS;
          if (kerf > 0 && reserveOverlap) throw new Error(`Internal kerf validation failed between rows #${a.rowId} and #${b.rowId} on sheet ${si + 1}.`);
        }
      }
    }
    return count;
  }

  function optimize(rows, options = {}) {
    const sheetLength = number(options.sheetLength, 'Sheet length', 1);
    const sheetWidth = number(options.sheetWidth, 'Sheet width', 1);
    const kerf = number(options.kerf ?? 0, 'Kerf', 0);
    const margin = number(options.margin ?? 0, 'Edge margin', 0);
    if (2 * margin >= Math.min(sheetLength, sheetWidth)) throw new Error('Edge margin is too large for this sheet.');
    const usableWidth = sheetLength - 2 * margin;
    const usableHeight = sheetWidth - 2 * margin;
    const items = expandRows(rows);
    const oversized = items.filter(p => {
      const normal = p.length <= usableWidth + EPS && p.width <= usableHeight + EPS;
      const rotated = p.rotate && p.width <= usableWidth + EPS && p.length <= usableHeight + EPS;
      return !normal && !rotated;
    });
    if (oversized.length) {
      const p = oversized[0];
      throw new Error(`Row #${p.rowId} (${p.length} × ${p.width} mm) is larger than the usable sheet (${usableWidth} × ${usableHeight} mm).`);
    }

    const effort = options.effort || 'high';
    const targetAttempts = effort === 'max' ? 64 : effort === 'standard' ? 12 : 32;
    const cfg = { sheetLength, sheetWidth, kerf, margin, usableWidth, usableHeight,
      bounds: { x: margin, y: margin, w: usableWidth, h: usableHeight } };

    const strategies = [];
    for (let i = 0; i < ORDERINGS.length; i++) {
      for (let j = 0; j < SCORERS.length; j++) {
        strategies.push({ ordering: ORDERINGS[i], scorer: SCORERS[j], variant: i + j });
      }
    }
    // Max effort adds alternate stable tie-break variants for extra diversification.
    if (effort === 'max') {
      for (let i = 0; i < 16; i++) strategies.push({
        ordering: ORDERINGS[i % ORDERINGS.length],
        scorer: SCORERS[(i * 3 + 1) % SCORERS.length],
        variant: i + 11
      });
    }

    let best = null;
    const attempts = Math.min(targetAttempts, strategies.length);
    for (let i = 0; i < attempts; i++) {
      const strategy = strategies[i];
      const sheets = runPacking(items, cfg, strategy.ordering, strategy.scorer, strategy.variant);
      const quality = layoutQuality(sheets, margin);
      const candidate = { sheets, quality, ordering: strategy.ordering, scorer: strategy.scorer };
      if (isBetter(candidate, best)) best = candidate;
    }

    const placed = validateLayout(best.sheets, kerf);
    if (placed !== items.length) throw new Error(`Only ${placed} of ${items.length} pieces were placed. The plan was rejected.`);
    const partArea = items.reduce((sum, p) => sum + p.area, 0);
    const grossSheetArea = sheetLength * sheetWidth * best.sheets.length;
    const usedArea = best.sheets.reduce((sum, s) => sum + s.placed.reduce((a, p) => a + p.w * p.h, 0), 0);
    return {
      sheets: best.sheets,
      sheetLength,
      sheetWidth,
      kerf,
      margin,
      rows: rows.length,
      pieces: items.length,
      partArea,
      grossSheetArea,
      usedArea,
      wasteArea: grossSheetArea - partArea,
      utilization: grossSheetArea ? partArea / grossSheetArea * 100 : 0,
      attempts,
      ordering: best.ordering,
      scorer: best.scorer,
      effort,
      validated: true
    };
  }

  return { optimize, expandRows };
});
