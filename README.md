# CutPlan MVP v0.3

A browser-based cutting-list and rectangular sheet nesting prototype.

## Run on Ubuntu

1. Extract the ZIP.
2. Open a terminal in the extracted `cutplan-mvp-v03` directory.
3. Run:

   ```bash
   python3 -m http.server 8000
   ```

4. Open `http://localhost:8000` in Chrome or Firefox.

The project is static HTML + JavaScript. OCR is loaded from the Tesseract.js CDN, so image OCR needs an internet connection. CSV import and manual entry work locally.

## Changes in v0.3

- Removed automatically inserted fake `Part 1` and `Part 2` sample rows. The application starts empty.
- Rows use the original cutting-list reference (`#1`, `#2`, etc.). Expanded physical pieces use labels such as `#13 · 1/2` and `#13 · 2/2`.
- Added an optional 27-row benchmark list matching the user's supplied cutting-list photo.
- OCR parser now treats the leading number as a row reference when a line contains row, length, width and quantity. It no longer blindly treats the first three numbers as length, width and quantity.
- Added image enlargement and grayscale/contrast preprocessing before OCR.
- Replaced the single greedy placement run with a multi-start MaxRects optimizer: up to 12 / 32 / 48 heuristic trials depending on search effort.
- Tries multiple part orderings and placement scores (best-short-side-fit, best-area-fit, best-long-side-fit and contact-point score).
- Checks that every requested piece is placed and validates that pieces do not overlap. The plan is rejected on validation failure.
- Layout labels show true part dimensions (not kerf-expanded dimensions).
- CSV rows preserve a row reference and rotation permission.

## Important limitations

- This is a stronger heuristic, not a mathematically guaranteed global optimum.
- This release performs general 2D rectangular nesting. It does not generate or certify a guillotine cut sequence. Confirm machine requirements before production.
- Kerf is reserved conservatively on the trailing/right and bottom side of placements; enter the measured kerf. A blank kerf uses a provisional zero-kerf layout and is not production-ready.
- OCR output remains a draft and must be checked against the source document.
- Grain direction, board defects, clamps, edge banding, material grouping, and machine-specific cut sequencing are not yet modeled.

## Test with the supplied benchmark

Choose CSV import → **Load my 27-row test list**. Confirm the sheet dimensions and kerf, then choose High or Maximum and Optimize. The expected source list contains 27 rows and 51 physical pieces.
