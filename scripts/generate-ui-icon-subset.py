"""Reproduce the optional home icon font; keep the full upstream font intact.

Install scripts/ui-icon-subset-requirements.txt in an isolated environment, then
run this script with --check (default) or --write. New/unlisted icons always use
the original font through a disjoint unicode-range face; no automatic pruning.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import stat

import brotli
import fontTools
from fontTools import subset
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / 'assets/fonts/kc-ui-icons'
MANIFEST_PATH = FONT_DIR / 'manifest.json'
CSS_PATH = ROOT / 'assets/css/kc-ui-icons.css'
FAMILY = 'Kino Campus UI Icons'


def validate_output_path(target: Path):
    relative = target.relative_to(ROOT)
    current = ROOT
    for part in relative.parts:
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise RuntimeError(f'Refusing symlink/junction/reparse output: {current}')
        if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
            raise RuntimeError(f'Refusing hard-linked output: {current}')
        if current != target and not stat.S_ISDIR(info.st_mode):
            raise RuntimeError(f'Output ancestor is not a directory: {current}')
    if not target.resolve().is_relative_to(ROOT):
        raise RuntimeError(f'Output escapes the repository: {target}')


def ranges(points: list[int]) -> str:
    groups = []
    for point in sorted(set(points)):
        if groups and groups[-1][1] + 1 == point:
            groups[-1][1] = point
        else:
            groups.append([point, point])
    return ','.join(f'U+{start:X}' + (f'-{end:X}' if start != end else '') for start, end in groups)


def generate():
    if fontTools.__version__ != '4.63.0' or brotli.__version__ != '1.2.0':
        raise RuntimeError('Use the pinned ui-icon-subset-requirements.txt for reproducibility')
    validate_output_path(MANIFEST_PATH)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    source = ROOT / 'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2'
    original = source.read_bytes()
    if hashlib.sha256(original).hexdigest() != manifest['upstreamSha256']:
        raise RuntimeError('Upstream font changed: review its license, cmap and metrics before regenerating')
    font = TTFont(io.BytesIO(original), recalcTimestamp=False, recalcBBoxes=False)
    cmap = font.getBestCmap()
    points = manifest['codepoints']
    if points != sorted(set(points)) or not set(points).issubset(cmap):
        raise RuntimeError('Manifest must contain unique sorted upstream codepoints')
    advances = {point: font['hmtx'].metrics[cmap[point]] for point in points}
    metric_fields = {
        'head': ['unitsPerEm', 'xMin', 'xMax', 'yMin', 'yMax'],
        'hhea': ['ascent', 'descent', 'lineGap'],
        'OS/2': ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'usWinAscent', 'usWinDescent'],
    }
    metrics = {(table, field): getattr(font[table], field) for table, fields in metric_fields.items() for field in fields}
    # Drawing can materialize lazy glyph tables. Use a separate instance so
    # validation itself cannot change the deterministic subset serialization.
    outline_source = TTFont(io.BytesIO(original), recalcTimestamp=False, recalcBBoxes=False)
    glyphs = outline_source.getGlyphSet()
    outlines = {}
    for point in points:
        pen = RecordingPen()
        glyphs[cmap[point]].draw(pen)
        outlines[point] = pen.value
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.glyph_names = True
    options.notdef_outline = True
    options.recalc_timestamp = False
    options.recalc_bounds = False
    options.layout_features = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    # Font Awesome is a Reserved Font Name. Keep copyright/license metadata,
    # but give the derived font its own internal family and PostScript names.
    names = {1: FAMILY, 2: 'Solid', 3: 'KinoCampusUIIcons-Solid-6.4.0',
             4: FAMILY + ' Solid', 6: 'KinoCampusUIIcons-Solid', 16: FAMILY, 17: 'Solid'}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.flavor = 'woff2'
    buffer = io.BytesIO()
    font.save(buffer)
    output = buffer.getvalue()
    verified = TTFont(io.BytesIO(output))
    output_cmap = verified.getBestCmap()
    if set(output_cmap) != set(points):
        raise RuntimeError('Generated cmap differs from the reviewed subset')
    if advances != {point: verified['hmtx'].metrics[output_cmap[point]] for point in points}:
        raise RuntimeError('Generated glyph advances changed')
    if metrics != {(table, field): getattr(verified[table], field) for table, fields in metric_fields.items() for field in fields}:
        raise RuntimeError('Generated font-wide layout metrics changed')
    output_glyphs = verified.getGlyphSet()
    for point in points:
        pen = RecordingPen()
        output_glyphs[output_cmap[point]].draw(pen)
        if pen.value != outlines[point]:
            raise RuntimeError(f'Generated glyph outline changed: U+{point:X}')
    digest = hashlib.sha256(output).hexdigest()
    filename = f'kc-ui-icons-solid-{digest[:12]}.woff2'
    remainder = sorted(set(cmap) - set(points))
    # U+20 participates in browser font metrics even though the upstream font
    # has no space glyph. Omitting it shifts the inline baseline by one pixel.
    css = f'''/* Kino Campus UI Icons: subset of Font Awesome Free 6.4.0.
 * Copyright 2023 Fonticons, Inc. Font software: SIL OFL 1.1.
 * License: ../fonts/kc-ui-icons/LICENSE.txt. Generated; see manifest.json.
 * Only solid classes opt in. Regular/brands and the vendor CSS stay intact.
 */
@font-face {{
  font-family: "{FAMILY}";
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url("../fonts/kc-ui-icons/{filename}") format("woff2"),
       url("../vendor/fontawesome/webfonts/fa-solid-900.woff2") format("woff2"),
       url("../vendor/fontawesome/webfonts/fa-solid-900.ttf") format("truetype");
  unicode-range: {ranges(points + [0x20])};
}}
@font-face {{
  font-family: "{FAMILY}";
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url("../vendor/fontawesome/webfonts/fa-solid-900.woff2") format("woff2"),
       url("../vendor/fontawesome/webfonts/fa-solid-900.ttf") format("truetype");
  unicode-range: {ranges(remainder)};
}}
.fa-solid, .fas {{
  font-family: "{FAMILY}";
}}
'''
    metadata = {**manifest, 'subsetFile': filename, 'subsetSha256': digest,
                'subsetBytes': len(output), 'upstreamBytes': len(original),
                'remainderCodepoints': remainder}
    return filename, output, css, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--write', action='store_true')
    group.add_argument('--check', action='store_true')
    args = parser.parse_args()
    filename, output, css, metadata = generate()
    font_path = FONT_DIR / filename
    serialized = json.dumps(metadata, indent=2) + '\n'
    # Prepare and validate every destination before the first write.
    for file in [FONT_DIR, font_path, CSS_PATH, MANIFEST_PATH]:
        validate_output_path(file)
    if args.write:
        # Explicit files only; never remove older fonts or change vendor files.
        FONT_DIR.mkdir(parents=True, exist_ok=True)
        font_path.write_bytes(output)
        CSS_PATH.write_text(css, encoding='utf-8', newline='\n')
        MANIFEST_PATH.write_text(serialized, encoding='utf-8', newline='\n')
    else:
        if font_path.read_bytes() != output:
            raise RuntimeError('Committed font is not reproducible')
        if CSS_PATH.read_text(encoding='utf-8') != css:
            raise RuntimeError('Committed CSS differs from generated ranges')
        if MANIFEST_PATH.read_text(encoding='utf-8') != serialized:
            raise RuntimeError('Committed manifest differs')
    print(json.dumps({'glyphs': len(metadata['codepoints']), 'bytes': len(output),
                      'upstreamBytes': metadata['upstreamBytes'], 'sha256': metadata['subsetSha256']}))


if __name__ == '__main__':
    main()
