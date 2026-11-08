# CutPlan v0.4.1 — Guillotine cutting prototype

Browser-based rectangular sheet-cutting prototype. It keeps the v0.4 multi-stage guillotine partition and cut-recording logic; this update improves input handling, annotation, and search diversification without allowing free-form/non-guillotine placements.

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Input methods

- **PDF:** Digital PDFs are read using PDF.js text extraction. Scanned PDFs are rendered page-by-page and passed through Tesseract OCR.
- **Image:** JPG/PNG OCR through Tesseract.
- **CSV:** `row_id,length,width,quantity,rotation,band_top,band_right,band_bottom,band_left`.
- **Manual:** Edit rows and top/right/bottom/left banding in the parts table.

Row references may be numeric or alphanumeric (`1`, `A`, `KB`, `CAB-A1`). References must be unique (case-insensitive). OCR output is only a draft and must be reviewed before optimization.

## v0.4.1 changes

- Added direct PDF input. Digital PDFs use text extraction first; image-only/scanned PDFs use internal page rendering plus OCR.
- Added alphanumeric cutting-list references in CSV and OCR parsing.
- Improved drawing annotations: labels are embedded only when they fit; small parts are listed in a separate callout table below the board so their dimensions remain readable and do not collide.
- Extended CSV import/export to preserve edge-banding selections.
- Expanded the search from a handful of sorted orders to multi-start part-order search plus four placement-ranking strategies. Search effort: Standard 12, High 64, Maximum 240 starts.
- Kept the multi-stage guillotine rectangular split, orientation, and cut-recording branches intact. Search candidates change; cut geometry remains guillotine-only.

## Validation

Run the basic engine checks with:

```bash
node test-engine.js
```

The test checks the 27-row benchmark (51 pieces), placement bounds, overlap, and alphanumeric references.

## Limitations

This is a heuristic prototype, not certified production/CNC software. The optimizer does not prove global optimality. A larger search effort may not find a better board count. On the supplied 27-row benchmark with a 2440 × 1220 mm sheet and 3 mm kerf, High search currently returns 5 sheets and 74.06% area utilization. Further improvement needs more advanced search/packing techniques; the reported result must not be described as globally optimal.

PDF.js and Tesseract are loaded from CDNs, so PDF reading and OCR require internet access in this browser-based version. Scanned/low-quality PDFs can still be misread; verify each extracted value. Kerf, edge trimming, grain, clamping, blade lead-in and actual machine cutting sequence must be checked before production. Edge banding is stored and shown as per-edge metadata; this does not generate an edgebander program.
