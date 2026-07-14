import sys
import re
from pathlib import Path


def is_power_of_two(n: int) -> bool:
    """
    与えられた整数が2の冪乗（2, 4, 8, 16...）であるかを判定する。
    ビット演算を用いて高速に判定する。
    """
    return n > 0 and (n & (n - 1)) == 0


def get_xpm_size(filepath: Path) -> tuple[int, int] | tuple[None, None]:
    """
    XPMファイルを読み込み、幅と高さを取得する。
    """
    # XPMの宣言部分は通常 '"幅 高さ 色数 文字数"' という形式になっている
    pattern = re.compile(r'"\s*(\d+)\s+(\d+)\s+\d+\s+\d+.*?"')

    try:
        # XPMはテキストベースだが、エンコーディングエラーを避けるため ascii/ignore で読み込む
        with open(filepath, "r", encoding="ascii", errors="ignore") as f:
            for line in f:
                match = pattern.search(line)
                if match:
                    width = int(match.group(1))
                    height = int(match.group(2))
                    return width, height
    except Exception as e:
        print(f"ファイルの読み込みエラー ({filepath}): {e}")

    return None, None


def check_xpm_dimensions(directory_path: str) -> None:
    """
    指定ディレクトリおよびサブディレクトリ内の.xpmファイルを調べ、幅と高さが2の冪乗か確認する。
    """
    target_dir = Path(directory_path)

    if not target_dir.is_dir():
        print(
            f"エラー: 指定されたパス '{directory_path}' は有効なディレクトリではない。"
        )
        return

    # rglob('*.xpm') を使用し、サブディレクトリを含めて再帰的に検索する
    xpm_files = list(target_dir.rglob("*.xpm"))

    if not xpm_files:
        print(
            f"'{directory_path}' およびサブディレクトリ内部に .xpm ファイルは見つからなかった。"
        )
        return

    print(f"--- 検索結果 ({directory_path} とサブディレクトリ) ---")
    for filepath in xpm_files:
        width, height = get_xpm_size(filepath)

        # どのサブディレクトリにあるか分かりやすくするため、基準ディレクトリからの相対パスを取得
        try:
            display_path = filepath.relative_to(target_dir)
        except ValueError:
            display_path = filepath.name

        if width is None or height is None:
            print(f"[不明] {display_path}: サイズ情報を解析できなかった。")
            continue

        is_w_pot = is_power_of_two(width)
        is_h_pot = is_power_of_two(height)

        if is_w_pot and is_h_pot:
            status = "OK"
        else:
            status = "NG"

        print(
            f"[{status}] {display_path}: 幅={width} (2の冪乗: {is_w_pot}), 高さ={height} (2の冪乗: {is_h_pot})"
        )


if __name__ == "__main__":
    # チェックしたいディレクトリのパスをここで指定する
    TARGET_DIRECTORY = "../../textures"

    check_xpm_dimensions(TARGET_DIRECTORY)
