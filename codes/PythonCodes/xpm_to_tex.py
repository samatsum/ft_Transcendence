#!/usr/bin/env python3
import json
import re
import struct
import sys
from pathlib import Path


def quoted_lines(text):
	return re.findall(r'"((?:\\.|[^"\\])*)"', text)


def parse_color(line, cpp):
	key = line[:cpp]
	parts = line[cpp:].strip().split()
	color = None
	for i, part in enumerate(parts):
		if part.lower() == 'c' and i + 1 < len(parts):
			color = parts[i + 1]
			break
	if color is None or color.lower() == 'none':
		return key, (0, 0, 0, 0)
	if color.startswith('#') and len(color) >= 7:
		return key, (int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16), 255)
	lower = color.lower()
	if lower == 'white':
		return key, (255, 255, 255, 255)
	if lower.startswith('gray') or lower.startswith('grey'):
		level = int(lower[4:])
		value = round(level * 255 / 100)
		return key, (value, value, value, 255)
	raise ValueError(f'unsupported color entry: {line!r}')


def convert_xpm(path):
	lines = quoted_lines(path.read_text(errors='replace'))
	if not lines:
		raise ValueError(f'{path}: no XPM payload')
	width, height, colors, cpp = [int(v) for v in lines[0].split()[:4]]
	palette = {}
	for line in lines[1:1 + colors]:
		key, rgba = parse_color(line, cpp)
		palette[key] = rgba
	pixels = lines[1 + colors:1 + colors + height]
	if len(pixels) != height:
		raise ValueError(f'{path}: expected {height} pixel rows, got {len(pixels)}')
	data = bytearray(width * height * 4)
	idx = 0
	for row in pixels:
		if len(row) < width * cpp:
			raise ValueError(f'{path}: short row')
		for x in range(width):
			key = row[x * cpp:(x + 1) * cpp]
			rgba = palette.get(key)
			if rgba is None:
				raise ValueError(f'{path}: unknown palette key {key!r}')
			data[idx:idx + 4] = bytes(rgba)
			idx += 4
	return width, height, data


def main():
	if len(sys.argv) != 3:
		print('usage: xpm_to_tex.py <texture-root> <out-root>', file=sys.stderr)
		return 2
	texture_root = Path(sys.argv[1])
	out_root = Path(sys.argv[2])
	manifest = []
	for xpm in sorted(texture_root.rglob('*.xpm')):
		rel = xpm.relative_to(Path('.'))
		out_rel = rel.with_suffix('.tex')
		out_path = out_root / out_rel
		out_path.parent.mkdir(parents=True, exist_ok=True)
		width, height, data = convert_xpm(xpm)
		out_path.write_bytes(struct.pack('<II', width, height) + data)
		manifest.append({
			'path': rel.as_posix(),
			'tex': out_path.relative_to(out_root.parent).as_posix(),
			'width': width,
			'height': height,
		})
	(out_root / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
	print(f'converted {len(manifest)} textures into {out_root}')
	return 0


if __name__ == '__main__':
	raise SystemExit(main())
