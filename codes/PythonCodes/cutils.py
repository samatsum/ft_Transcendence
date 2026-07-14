"""cutils — clint の共有基盤モジュール。

9 本の検査スクリプトに散らばっていた「コメント除去」「ファイル走査」
「関数定義の正規表現」「パス解決」「結果レポート」を 1 か所に集約する。
各 check_*.py が個別に持っていた副作用（os.walk・sys.exit・print）を排除し、
検査関数は Finding を返すだけの純粋関数にできるようにするのが狙い。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from functools import cached_property
from pathlib import Path
from typing import Iterable, Iterator, Optional, Sequence

# --------------------------------------------------------------------------- #
# 共通定数 / 正規表現（プロジェクト全体で唯一の定義）
# --------------------------------------------------------------------------- #

#: 検査対象ディレクトリと拡張子のデフォルト（"srcs"/"includes" は論理カテゴリ名）
DEFAULT_DIRS: tuple[str, ...] = ("srcs", "includes")
DEFAULT_EXTS: tuple[str, ...] = (".c", ".h")

#: 論理カテゴリ → 実ディレクトリ（プロジェクトルートからの相対）。
#: ソースは単一の srcs/ 配下 (srcs/common, srcs/fps, srcs/rsp) に集約する。
CATEGORY_DIRS: dict[str, tuple[str, ...]] = {
    "srcs": ("srcs",),
    "includes": ("includes",),
}

#: 関数定義（CR005 準拠）:
#: 「戻り値型の行」+ 改行 + タブ + 関数名 + 引数 + 改行 + '{'
#: group(1)=戻り値型(static 等を含む) / group(2)=関数名
#: 引数部を [^;{] に限定するのが要点。'[\s\S]*?' だと非貪欲マッチがプロトタイプ
#: 宣言の ');' を越えて下の本体定義の ')\n{' まで繋がり、プロトタイプを関数定義と
#: 誤認する。';' と '{' を禁止すれば、';' で終わるプロトタイプは決してマッチしない。
FUNC_DEF_RE = re.compile(
    r"^([a-zA-Z_][^\n]*)\n\t([a-zA-Z_]\w*)\s*\([^;{]*?\)\n\{", re.MULTILINE
)

#: static 関数の定義（先頭が static で始まる関数定義）。group(1)=関数名
STATIC_DEF_RE = re.compile(r"^static\s+[^\n]+\n\t([a-zA-Z_]\w*)\s*\(", re.MULTILINE)

#: 区切りコメント '/* ***...*** */'（アスタリスク 74 個）
SEPARATOR_RE = re.compile(r"^/\* \*{74} \*/$")

#: 挿入用の正規セパレータ行（80 桁 = '/* ' + '*'*74 + ' */'）
SEPARATOR_LINE = "/* " + "*" * 74 + " */"

#: //コメントが無い箇所に挿入する雛形（人手で説明を埋める前提）
PLACEHOLDER_COMMENT = "// TODO: 関数の説明を記述する"

#: マクロ定義。group(1)=マクロ名
MACRO_DEF_RE = re.compile(r"^\s*#\s*define\s+([A-Za-z_]\w*)", re.MULTILINE)

# 内部用：コメント / 文字列の除去パターン
# 注意: re.DOTALL 下では '.' が改行にもマッチするため、行コメントは '.*' ではなく
# '[^\n]*' で「行末まで」に限定する。'.*' のままだと最初の '//' が EOF まで全て
# 飲み込み、以降のコードが検査対象から消える（旧スクリプトの潜在バグ）。
_COMMENTS_ONLY = re.compile(r"/\*.*?\*/|//[^\n]*", re.DOTALL)
_COMMENTS_AND_STRINGS = re.compile(r'/\*.*?\*/|//[^\n]*|".*?"', re.DOTALL)


# --------------------------------------------------------------------------- #
# コメント / 文字列の除去（旧 remove_comments / remove_comments_and_strings の統合）
# --------------------------------------------------------------------------- #


def strip_comments(text: str, *, strings: bool = False) -> str:
    """C ソースからコメントを除去する。行番号を保つため改行は温存する。

    strings=True のときは文字列リテラルも ""（空文字列）へ置換し、
    リテラル内部の誤検知を防ぐ。
    """

    def _repl(match: re.Match) -> str:
        s = match.group(0)
        if s.startswith("/*"):
            return "\n" * s.count("\n")  # ブロックコメントは行数だけ維持
        if s.startswith("//"):
            return ""
        return '""'  # 文字列リテラル

    pattern = _COMMENTS_AND_STRINGS if strings else _COMMENTS_ONLY
    return pattern.sub(_repl, text)


# --------------------------------------------------------------------------- #
# プロジェクトルートの解決（旧 SRC_DIR="../srcs" のハードコード排除）
# --------------------------------------------------------------------------- #


def find_project_root(start: Optional[Path] = None) -> Path:
    """includes/ と、いずれかのソースツリーを同時に含むディレクトリを返す。

    実行時のカレントディレクトリに依存しないため、リポジトリのどこから
    呼んでも（Makefile からでも）動作する。common/fps/rsp 分割後・分割前の
    どちらのレイアウトでも codes/ をルートとして検出できる。
    """
    base = Path(start or __file__).resolve()
    for d in [base, *base.parents]:
        if (d / "includes").is_dir() and any(
            (d / s).is_dir() for s in CATEGORY_DIRS["srcs"]
        ):
            return d
    raise FileNotFoundError(
        "includes/ とソースツリー (srcs/) を含む"
        "プロジェクトルートが見つかりませんでした。--root で明示してください。"
    )


def iter_sources(
    root: Path,
    dirs: Sequence[str] = DEFAULT_DIRS,
    exts: Sequence[str] = DEFAULT_EXTS,
) -> Iterator[Path]:
    """root 配下の対象ディレクトリから .c / .h を昇順で列挙する。

    dirs には論理カテゴリ名 ("srcs"/"includes") を渡す。CATEGORY_DIRS で
    実ディレクトリ (srcs/ 配下) へ展開してから走査する。存在しない
    ツリーは黙ってスキップする。
    """
    real_dirs: list[str] = []
    for logical in dirs:
        real_dirs.extend(CATEGORY_DIRS.get(logical, (logical,)))
    for d in real_dirs:
        base = root / d
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if path.is_file() and path.suffix in exts:
                yield path


# --------------------------------------------------------------------------- #
# ソースファイル 1 つ分の表現（読み込みとクリーニングのキャッシュを担う）
# --------------------------------------------------------------------------- #


class SourceFile:
    """1 ファイルの生テキストと、クリーニング済みテキストを保持する。

    複数の検査が同じファイルを何度も読み直す無駄をなくすため、
    生テキストとクリーニング結果を 1 度だけ計算してキャッシュする。
    """

    def __init__(self, path: Path, root: Path) -> None:
        self.path = path
        self.root = root
        self.raw = path.read_text(encoding="utf-8", errors="replace")

    @property
    def suffix(self) -> str:
        return self.path.suffix

    @property
    def rel(self) -> str:
        """ルートからの相対表示パス (例: srcs/common/config/config.c)。"""
        return self.path.relative_to(self.root).as_posix()

    @property
    def top_dir(self) -> str:
        """論理カテゴリ名 ('srcs' / 'includes') を返す。

        common/fps/rsp 分割後も Context.select(("srcs",), ...) が一致するよう、
        物理パス (srcs/common/... 等) を論理カテゴリへ正規化する。
        """
        rel = self.path.relative_to(self.root).as_posix()
        for category, trees in CATEGORY_DIRS.items():
            for tree in trees:
                if rel == tree or rel.startswith(tree + "/"):
                    return category
        return self.path.relative_to(self.root).parts[0]

    @cached_property
    def no_comments(self) -> str:
        return strip_comments(self.raw)

    @cached_property
    def no_comments_strings(self) -> str:
        return strip_comments(self.raw, strings=True)


# --------------------------------------------------------------------------- #
# 検査結果（Finding）と重大度
# --------------------------------------------------------------------------- #


class Severity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"


@dataclass(frozen=True)
class Finding:
    """1 件の検査指摘。print の代わりに検査関数はこれを返す。"""

    severity: Severity
    path: Optional[Path] = None
    line: Optional[int] = None
    message: str = ""
    detail: Optional[str] = None

    def location(self, root: Path) -> str:
        if self.path is None:
            return "-"
        rel = self.path.relative_to(root).as_posix()
        return f"{rel}:{self.line}" if self.line else rel


# --------------------------------------------------------------------------- #
# 検査コンテキスト（ファイル群を 1 度だけ読み、各検査へ供給する）
# --------------------------------------------------------------------------- #


class Context:
    """ルート配下の対象ファイルを読み込み、検査関数へ渡す入れ物。"""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.files: list[SourceFile] = [SourceFile(p, root) for p in iter_sources(root)]

    def select(self, dirs: Sequence[str], exts: Sequence[str]) -> list[SourceFile]:
        """ディレクトリ名と拡張子で対象ファイルを絞り込む。"""
        return [sf for sf in self.files if sf.top_dir in dirs and sf.suffix in exts]


# --------------------------------------------------------------------------- #
# 関数定義の列挙 / セパレータ判定 / 自動挿入（separators 検査と --fix が共有）
# --------------------------------------------------------------------------- #


def iter_func_defs(content: str) -> Iterator[tuple[str, int]]:
    """生テキストから (関数名, 戻り値型の行の 0 始まり index) を列挙する。"""
    for m in FUNC_DEF_RE.finditer(content):
        line_idx = content.count("\n", 0, m.start())
        yield m.group(2), line_idx


@dataclass
class SepStatus:
    """関数定義の直前にあるべきセパレータ/コメントの状態。

    status: "ok" / "no_separator" / "no_comment" / "no_doc"
    sep_at:     セパレータを挿入すべき行 index（不要なら None）
    comment_at: //コメントを挿入すべき行 index（不要なら None）
    """

    status: str
    sep_at: Optional[int] = None
    comment_at: Optional[int] = None


def separator_status(lines: list[str], func_idx: int) -> SepStatus:
    """関数定義行の直前を遡り、セパレータ/コメントの過不足を判定する。

    複数行の // コメントブロックにも対応する（連続する // 行をまとめて 1 つの
    ドキュメントブロックとして扱い、その上にセパレータがあるかを見る）。
    """
    # 1) 関数行の直上、空行を飛ばして最初の有効行を探す
    i = func_idx - 1
    while i >= 0 and not lines[i].strip():
        i -= 1

    if i < 0:
        # ファイル先頭に関数がある：セパレータも // も無い
        return SepStatus("no_doc", sep_at=func_idx, comment_at=func_idx)

    line = lines[i].strip()

    # 2) 直上が // コメント → ドキュメントあり。連続する // の先頭まで遡る
    if line.startswith("//"):
        top = i
        while top - 1 >= 0 and lines[top - 1].strip().startswith("//"):
            top -= 1
        j = top - 1
        while j >= 0 and not lines[j].strip():
            j -= 1
        if j >= 0 and SEPARATOR_RE.match(lines[j].strip()):
            return SepStatus("ok")
        return SepStatus("no_separator", sep_at=top)

    # 3) 直上がセパレータ → セパレータはあるが // コメントが無い
    if SEPARATOR_RE.match(line):
        return SepStatus("no_comment", comment_at=func_idx)

    # 4) どちらも無い
    return SepStatus("no_doc", sep_at=func_idx, comment_at=func_idx)


def fix_separators(sf: SourceFile) -> list[str]:
    """1 ファイルに不足しているセパレータ/コメント雛形を挿入して上書き保存する。

    返り値は人間向けの変更内容リスト（空なら無変更）。
    挿入はコメント行のみなのでコンパイル結果には一切影響しない。
    """
    content = sf.raw
    lines = content.split("\n")
    insertions: list[tuple[int, list[str]]] = []
    notices: list[str] = []

    def _block_with_lead(idx: int, block: list[str]) -> list[str]:
        # 直上が非空行なら、見やすさのため空行を 1 つ前置する
        if idx - 1 >= 0 and lines[idx - 1].strip():
            return ["", *block]
        return block

    for name, fidx in iter_func_defs(content):
        st = separator_status(lines, fidx)
        if st.status == "ok":
            continue
        if st.status == "no_separator":
            assert st.sep_at is not None
            insertions.append(
                (st.sep_at, _block_with_lead(st.sep_at, [SEPARATOR_LINE]))
            )
            notices.append(f"セパレータ追加: '{name}'")
        elif st.status == "no_comment":
            assert st.comment_at is not None
            insertions.append((st.comment_at, [PLACEHOLDER_COMMENT]))
            notices.append(f"//雛形追加(要記述): '{name}'")
        elif st.status == "no_doc":
            assert st.sep_at is not None
            block = _block_with_lead(st.sep_at, [SEPARATOR_LINE, PLACEHOLDER_COMMENT])
            insertions.append((st.sep_at, block))
            notices.append(f"セパレータ+//雛形追加(要記述): '{name}'")

    if not insertions:
        return []

    # 行 index がずれないよう、後ろ（大きい index）から挿入する
    for idx, block in sorted(insertions, key=lambda x: x[0], reverse=True):
        lines[idx:idx] = block

    sf.path.write_text("\n".join(lines), encoding="utf-8")
    return notices
