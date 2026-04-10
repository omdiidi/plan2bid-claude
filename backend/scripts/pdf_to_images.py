#!/usr/bin/env python3
"""Convert PDF pages to PNG images using PyMuPDF (fitz).

Usage:
    python pdf_to_images.py <pdf_path> [options]

Options:
    --pages RANGE    Page range, e.g. "1-5" or "3" or "1,3,5-8" (default: all)
    --dpi DPI        Resolution in DPI (default: 200)
    --output DIR     Output directory (default: <pdf_dir>/<pdf_stem>_images/)
    --grid NxM       Combine pages into grid images, e.g. "2x2"
    --crop L,T,R,B   Crop margins in points, e.g. "36,36,36,36"
"""

import argparse
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("ERROR: PyMuPDF (fitz) is required. Install with: pip install PyMuPDF", file=sys.stderr)
    sys.exit(1)


def parse_page_range(spec: str, total_pages: int) -> list[int]:
    """Parse a page range spec like '1-5', '3', '1,3,5-8' into zero-based page indices."""
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            start = max(1, int(start))
            end = min(total_pages, int(end))
            pages.extend(range(start - 1, end))
        else:
            p = int(part) - 1
            if 0 <= p < total_pages:
                pages.append(p)
    return sorted(set(pages))


def parse_crop(spec: str) -> tuple[float, float, float, float]:
    """Parse crop spec 'L,T,R,B' in points."""
    parts = [float(x.strip()) for x in spec.split(",")]
    if len(parts) != 4:
        raise ValueError("Crop must be L,T,R,B (4 values)")
    return (parts[0], parts[1], parts[2], parts[3])


def parse_grid(spec: str) -> tuple[int, int]:
    """Parse grid spec 'NxM'."""
    parts = spec.lower().split("x")
    if len(parts) != 2:
        raise ValueError("Grid must be NxM, e.g. 2x2")
    return (int(parts[0]), int(parts[1]))


def render_page(page: fitz.Page, dpi: int, crop: tuple[float, float, float, float] | None = None) -> fitz.Pixmap:
    """Render a single page to a pixmap."""
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    if crop:
        rect = page.rect
        clip = fitz.Rect(
            rect.x0 + crop[0],
            rect.y0 + crop[1],
            rect.x1 - crop[2],
            rect.y1 - crop[3],
        )
        pix = page.get_pixmap(matrix=mat, clip=clip)
    else:
        pix = page.get_pixmap(matrix=mat)
    return pix


def save_grid(pixmaps: list[fitz.Pixmap], cols: int, rows: int, output_path: Path):
    """Combine pixmaps into a grid image."""
    if not pixmaps:
        return
    max_w = max(p.width for p in pixmaps)
    max_h = max(p.height for p in pixmaps)
    grid_w = max_w * cols
    grid_h = max_h * rows

    result = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, grid_w, grid_h), 1)
    result.set_rect(result.irect, (255, 255, 255))

    for idx, pix in enumerate(pixmaps):
        r = idx // cols
        c = idx % cols
        if r >= rows:
            break
        x = c * max_w
        y = r * max_h
        target = fitz.IRect(x, y, x + pix.width, y + pix.height)
        result.set_rect(target, (255, 255, 255))
        result.copy(pix, target)

    result.save(str(output_path))


def main():
    parser = argparse.ArgumentParser(description="Convert PDF pages to PNG images")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--pages", default=None, help="Page range (e.g. '1-5', '3', '1,3,5-8')")
    parser.add_argument("--dpi", type=int, default=200, help="Resolution in DPI (default: 200)")
    parser.add_argument("--output", default=None, help="Output directory")
    parser.add_argument("--grid", default=None, help="Grid layout, e.g. '2x2'")
    parser.add_argument("--crop", default=None, help="Crop margins in points: L,T,R,B")
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = pdf_path.parent / f"{pdf_path.stem}_images"
    output_dir.mkdir(parents=True, exist_ok=True)

    crop = parse_crop(args.crop) if args.crop else None
    grid = parse_grid(args.grid) if args.grid else None

    doc = fitz.open(str(pdf_path))
    total_pages = len(doc)
    print(f"Opened {pdf_path.name}: {total_pages} pages")

    if args.pages:
        page_indices = parse_page_range(args.pages, total_pages)
    else:
        page_indices = list(range(total_pages))

    if not page_indices:
        print("No pages to render.")
        doc.close()
        return

    if grid:
        cols, rows = grid
        per_grid = cols * rows
        pixmaps = []
        grid_num = 1
        for idx in page_indices:
            page = doc[idx]
            pix = render_page(page, args.dpi, crop)
            pixmaps.append(pix)
            if len(pixmaps) == per_grid:
                out_path = output_dir / f"{pdf_path.stem}_grid_{grid_num:03d}.png"
                save_grid(pixmaps, cols, rows, out_path)
                print(f"  Saved grid: {out_path.name}")
                pixmaps = []
                grid_num += 1
        if pixmaps:
            out_path = output_dir / f"{pdf_path.stem}_grid_{grid_num:03d}.png"
            save_grid(pixmaps, cols, rows, out_path)
            print(f"  Saved grid: {out_path.name}")
    else:
        for idx in page_indices:
            page = doc[idx]
            pix = render_page(page, args.dpi, crop)
            out_path = output_dir / f"{pdf_path.stem}_page_{idx + 1:03d}.png"
            pix.save(str(out_path))
            print(f"  Saved: {out_path.name}")

    doc.close()
    print(f"Done. {len(page_indices)} pages rendered to {output_dir}")


if __name__ == "__main__":
    main()
