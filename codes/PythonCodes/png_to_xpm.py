import os
from PIL import Image


def convert_png_to_xpm(root_dir):
    safe_chars = [chr(i) for i in range(33, 127) if chr(i) not in ['"', "\\"]]

    # os.walkでサブディレクトリを含めて再帰的に探索
    for dirpath, dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            if not filename.lower().endswith(".png"):
                continue

            input_path = os.path.join(dirpath, filename)
            output_path = os.path.join(dirpath, os.path.splitext(filename)[0] + ".xpm")

            try:
                original_img = Image.open(input_path).convert("RGBA")
                width, height = original_img.size

                background = Image.new("RGBA", (width, height), (255, 255, 255, 255))
                blended_img = Image.alpha_composite(background, original_img)

                max_colors = len(safe_chars) - 1
                quantized = blended_img.convert("RGB").quantize(colors=max_colors)

                palette_data = quantized.getpalette()
                color_map = {}
                for i in range(max_colors):
                    if palette_data and len(palette_data) >= i * 3 + 3:
                        r, g, b = palette_data[i * 3 : i * 3 + 3]
                        hex_color = f"#{r:02x}{g:02x}{b:02x}"
                        if hex_color == "#000000":
                            hex_color = "#010101"
                        color_map[i] = (safe_chars[i + 1], hex_color)

                TRANSPARENT_CHAR = safe_chars[0]
                xpm_name = (
                    os.path.splitext(filename)[0].replace("-", "_").replace(" ", "_")
                )
                xpm_lines = [
                    "/* XPM */",
                    f"static char * {xpm_name}[] = {{",
                    f'"{width} {height} {len(color_map) + 1} 1",',
                ]
                xpm_lines.append(f'"{TRANSPARENT_CHAR} c None",')
                for index, (char, hex_color) in color_map.items():
                    xpm_lines.append(f'"{char} c {hex_color}",')

                orig_pixels = list(original_img.getdata())
                quantized_pixels = list(quantized.getdata())

                for y in range(height):
                    row_chars = ""
                    for x in range(width):
                        idx = y * width + x
                        a = orig_pixels[idx][3]
                        if a == 0:
                            row_chars += TRANSPARENT_CHAR
                        else:
                            q_pixel = quantized_pixels[idx]
                            row_chars += color_map.get(q_pixel, (safe_chars[1], ""))[0]

                    terminator = "," if y < height - 1 else ""
                    xpm_lines.append(f'"{row_chars}"{terminator}')
                xpm_lines.append("};")

                with open(output_path, "w", encoding="ascii") as f:
                    f.write("\n".join(xpm_lines))
                print(f"変換成功: {input_path} -> {output_path}")

            except Exception as e:
                print(f"エラー ({input_path}): {e}")


if __name__ == "__main__":
    convert_png_to_xpm("../../textures")
