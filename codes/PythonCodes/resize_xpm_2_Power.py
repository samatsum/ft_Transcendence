import sys
import re
import math
import subprocess
from pathlib import Path


def get_nearest_power_of_two(n: int) -> int:
    """
    与えられた整数に最も近い2の冪乗の数値を計算して返す。
    例: 30 -> 32, 20 -> 16
    """
    if n <= 0:
        return 1
    # 2進数対数を取り、四捨五入して最も近い指数を求める
    exponent = round(math.log2(n))
    return 2**exponent


def get_xpm_size(filepath: Path) -> tuple[int, int] | tuple[None, None]:
    """
    XPMファイルを読み込み、現在の幅と高さを取得する。
    """
    pattern = re.compile(r'"\s*(\d+)\s+(\d+)\s+\d+\s+\d+.*?"')
    try:
        with open(filepath, "r", encoding="ascii", errors="ignore") as f:
            for line in f:
                match = pattern.search(line)
                if match:
                    return int(match.group(1)), int(match.group(2))
    except Exception as e:
        print(f"ファイルの読み込みエラー ({filepath.name}): {e}")
    return None, None


def resize_xpm_image(filepath: Path, new_w: int, new_h: int) -> bool:
    """
    ImageMagickのmagickコマンドを呼び出して画像をリサイズし、上書き保存する。
    """
    try:
        # '!' をサイズの後ろにつけることで、比率を強制的に指定サイズに変更する
        cmd = [
            "convert",
            str(filepath),
            "-resize",
            f"{new_w}x{new_h}!",
            str(filepath),
        ]
        # shell=Falseで安全に外部プロセスを実行
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"ImageMagick実行エラー ({filepath.name}): {e.stderr.decode().strip()}")
    except FileNotFoundError:
        print(
            "エラー: ImageMagickがシステムに見つからない。'magick' コマンドが利用可能か確認してください。"
        )
        sys.exit(1)
    return False


def batch_resize_pot(directory_path: str) -> None:
    """
    指定ディレクトリ以下の.xpmを探索し、最も近い2の冪乗に一括リサイズする。
    """
    target_dir = Path(directory_path)
    if not target_dir.is_dir():
        print(f"エラー: パス '{directory_path}' は有効なディレクトリではない。")
        return

    xpm_files = list(target_dir.rglob("*.xpm"))
    if not xpm_files:
        print(f"'.xpm' ファイルが見つからなかった。")
        return

    print(f"--- 一括リサイズ処理を開始します ({len(xpm_files)}個のファイル) ---")

    success_count = 0
    skip_count = 0

    for filepath in xpm_files:
        try:
            display_path = filepath.relative_to(target_dir)
        except ValueError:
            display_path = filepath.name

        width, height = get_xpm_size(filepath)
        if width is None or height is None:
            print(f"[スキップ] {display_path}: サイズ情報を解析できなかった。")
            continue

        # 最寄りの2の冪乗サイズを算出
        target_w = get_nearest_power_of_two(width)
        target_h = get_nearest_power_of_two(height)

        # 既に適切なサイズなら処理をスキップ
        if width == target_w and height == target_h:
            print(
                f"[維持] {display_path}: 既に2の冪乗サイズである (幅={width}, 高さ={height})"
            )
            skip_count += 1
            continue

        # リサイズを実行
        print(
            f"[リサイズ中] {display_path}: ({width}x{height}) -> ({target_w}x{target_h})"
        )
        if resize_xpm_image(filepath, target_w, target_h):
            success_count += 1

    print(f"\n--- 処理完了 ---")
    print(f"リサイズ成功: {success_count} 件 / スキップ(変更不要): {skip_count} 件")


if __name__ == "__main__":
    # 対象のフォルダパスを指定
    TARGET_DIRECTORY = "../../textures"

    batch_resize_pot(TARGET_DIRECTORY)
