"""checks — 9 本の検査スクリプトを 1 つに統合した検査レジストリ。

旧 check_includes.py / check_pointer_notation.py / check_style.py /
check_signatures.py / check_separators.py / check_duplicates.py /
check_magic_numbers.py / check_unused_funcs.py / check_static.py 系の検査を、
それぞれ「Finding を返す純粋関数」へ書き直して 1 ファイルに集約した。

各関数は @check デコレータで CHECKS に登録され、lint.py がまとめて実行する。
共有ロジック（コメント除去・ファイル走査・正規表現）は cutils に集約済み。
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Callable, Iterable, List

from cutils import (
    FUNC_DEF_RE,
    MACRO_DEF_RE,
    STATIC_DEF_RE,
    Context,
    Finding,
    Severity,
    iter_func_defs,
    separator_status,
)

# --------------------------------------------------------------------------- #
# 検査レジストリと登録デコレータ
# --------------------------------------------------------------------------- #

CheckFn = Callable[[Context], Iterable[Finding]]


class Check:
    """検査 1 つ分のメタ情報＋実行関数。"""

    def __init__(self, name: str, summary: str, fn: CheckFn) -> None:
        self.name = name
        self.summary = summary
        self.fn = fn

    def run(self, ctx: Context) -> List[Finding]:
        return list(self.fn(ctx))


CHECKS: List[Check] = []


def check(name: str, summary: str) -> Callable[[CheckFn], CheckFn]:
    """検査関数を CHECKS に登録するデコレータ。"""

    def deco(fn: CheckFn) -> CheckFn:
        CHECKS.append(Check(name, summary, fn))
        return fn

    return deco


# 小さなヘルパ：Finding を簡潔に生成する
def _err(path, line, message, detail=None) -> Finding:
    return Finding(Severity.ERROR, path, line, message, detail)


def _warn(path, line, message, detail=None) -> Finding:
    return Finding(Severity.WARNING, path, line, message, detail)


# --------------------------------------------------------------------------- #
# CR001: 42 header は不要
# --------------------------------------------------------------------------- #


@check("no-42-header", "CR001: 42 header をファイル先頭に置かない")
def check_no_42_header(ctx: Context) -> Iterable[Finding]:
    markers = ("Created:", "Updated:", "By:", ":::      :::::::: ")
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        head = "\n".join(sf.raw.splitlines()[:12])
        if "/* ************************************************************************** */" not in head:
            continue
        if any(marker in head for marker in markers):
            yield _err(sf.path, 1, "42 header が残っている", "このリポジトリではファイル先頭の 42 header は不要")


# --------------------------------------------------------------------------- #
# CR002: include 順序。標準ヘッダは自作ヘッダより前
# --------------------------------------------------------------------------- #


@check("includes", 'CR002: 標準ヘッダ <> は自作ヘッダ "" より前に置く')
def check_includes(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        seen_local = False
        for n, line in enumerate(sf.raw.splitlines(), 1):
            s = line.strip()
            if not s.startswith("#include"):
                continue
            if '"' in s:
                seen_local = True
            elif "<" in s and ">" in s and seen_local:
                yield _err(
                    sf.path,
                    n,
                    "自作ヘッダの後に標準ヘッダが置かれている",
                    f'{s} は自作ヘッダ("")より前に書く',
                )


# --------------------------------------------------------------------------- #
# CR004: ポインタ表記。'*' は型名側に寄せ、const は基本前置にする
# --------------------------------------------------------------------------- #

_PTR_TYPE_RE = re.compile(
    r"\b(int|char|float|double|void|long|short|unsigned|signed|size_t"
    r"|t_[a-zA-Z0-9_]+)\s+\*"
)
_PTR_STRUCT_RE = re.compile(r"\bstruct\s+s_[a-zA-Z0-9_]+\s+\*")
_CONST_AFTER_TYPE_RE = re.compile(
    r"\b((?:unsigned|signed)\s+)?"
    r"(int|char|float|double|void|long|short|size_t|bool|t_[a-zA-Z0-9_]+)"
    r"\s+const\s*\*"
)
_CONST_AFTER_STRUCT_RE = re.compile(r"\bstruct\s+s_[a-zA-Z0-9_]+\s+const\s*\*")


@check("pointer", "CR004: '*' は型名側に寄せ、const は型名の前に置く")
def check_pointer(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        for n, line in enumerate(sf.no_comments_strings.splitlines(), 1):
            if _CONST_AFTER_TYPE_RE.search(line) or _CONST_AFTER_STRUCT_RE.search(line):
                yield _err(
                    sf.path,
                    n,
                    "const が型名の後ろに置かれている",
                    f"{line.strip()} → 'const char* name;' の形にする",
                )
            if _PTR_TYPE_RE.search(line) or _PTR_STRUCT_RE.search(line):
                yield _err(
                    sf.path,
                    n,
                    "ポインタ '*' が型名から離れている",
                    f"{line.strip()} → 'int* ptr;' の形にする",
                )


# --------------------------------------------------------------------------- #
# CR003 / CR006 / CR007: 制御構文の空白・else 形・終端改行
# --------------------------------------------------------------------------- #

_MISSING_SPACE_RE = re.compile(r"\b(if|for|while)\(")
_ELSE_RE = re.compile(r"\belse\b")


@check("style", "CR003/CR006/CR007: 制御構文の空白 / else 形 / 終端改行")
def check_style(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        # [CR007] 終端改行（生テキストで判定）
        if sf.raw and not sf.raw.endswith("\n"):
            yield _err(sf.path, None, "ファイル終端が改行で終わっていない")

        for n, line in enumerate(sf.no_comments_strings.splitlines(), 1):
            s = line.strip()
            if not s:
                continue
            # [CR003] if/for/while の直後に空白がない
            m = _MISSING_SPACE_RE.search(s)
            if m:
                kw = m.group(1)
                yield _err(
                    sf.path,
                    n,
                    f"'{kw}' の直後に空白がない",
                    f"'{kw} (' と書く",
                )
            # [CR006] else は '} else {' / '} else if' の形
            if _ELSE_RE.search(s) and "} else {" not in s and "} else if" not in s:
                yield _err(
                    sf.path,
                    n,
                    "else の形が不正",
                    "'} else {' または '} else if' にする",
                )


# --------------------------------------------------------------------------- #
# CR005: シグネチャ。戻り値型と関数名を別行に、名前行は先頭タブ
# --------------------------------------------------------------------------- #

_SIG_SAME_LINE_RE = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_\s\*]*?)\s+([a-zA-Z_]\w*)\s*\(")
_SIG_NO_TAB_RE = re.compile(r"^([a-zA-Z_]\w*)\s*\(")
_SIG_IGNORE = {"if", "while", "for", "switch", "return", "sizeof", "else"}


@check("signatures", "CR005: 戻り値型と関数名は別行・名前行は先頭タブ")
def check_signatures(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        for n, line in enumerate(sf.no_comments_strings.splitlines(), 1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue

            m = _SIG_SAME_LINE_RE.match(line)
            if m:
                first_word = m.group(1).split()[0]
                func_name = m.group(2)
                if first_word not in _SIG_IGNORE and func_name not in _SIG_IGNORE:
                    yield _err(
                        sf.path,
                        n,
                        "戻り値型と関数名が同じ行にある",
                        f"{line.strip()} → 型と名前を別行に分ける",
                    )
                    continue

            m = _SIG_NO_TAB_RE.match(line)
            if m and m.group(1) not in _SIG_IGNORE:
                yield _err(
                    sf.path,
                    n,
                    "関数名の行に先頭タブがない",
                    f"{line.strip()} → 先頭にタブ 1 つを入れる",
                )


# --------------------------------------------------------------------------- #
# CR008 / CR009: 関数定義の直前に区切りと // コメント
# --------------------------------------------------------------------------- #


@check("separators", "CR008/CR009: 関数定義の直前にセパレータと // コメント")
def check_separators(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs",), (".c",)):
        lines = sf.raw.split("\n")
        for name, fidx in iter_func_defs(sf.raw):
            st = separator_status(lines, fidx)
            if st.status == "ok":
                continue
            if st.status in ("no_separator", "no_doc"):
                yield _err(
                    sf.path,
                    fidx + 1,
                    f"関数 '{name}' の前にセパレータが無い/不正",
                )
            if st.status in ("no_comment", "no_doc"):
                yield _err(
                    sf.path,
                    fidx + 1,
                    f"関数 '{name}' の直前に '//' コメントがない",
                )


# --------------------------------------------------------------------------- #
# 重複・名前衝突（マクロ二重定義 / 関数の多重定義）
# --------------------------------------------------------------------------- #


@check("duplicates", "CR013: マクロ二重定義・関数の多重定義/名前衝突を検出")
def check_duplicates(ctx: Context) -> Iterable[Finding]:
    macro_defs: dict[str, list] = defaultdict(list)
    func_defs: dict[str, list] = defaultdict(list)

    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        for m in MACRO_DEF_RE.finditer(sf.no_comments):
            macro_defs[m.group(1)].append(sf.path)
        if sf.suffix == ".c":
            for m in FUNC_DEF_RE.finditer(sf.no_comments):
                ret_type = m.group(1).strip()
                is_static = "static" in ret_type.split()
                func_defs[m.group(2)].append((sf.path, is_static))

    for macro, paths in macro_defs.items():
        unique = list(set(paths))
        if len(unique) > 1:
            detail = "\n        ".join(p.name for p in unique)
            yield _err(
                None,
                None,
                f"マクロ '{macro}' が複数ファイルで定義されている",
                detail,
            )
        elif len(paths) > 1:
            yield _warn(
                paths[0],
                None,
                f"マクロ '{macro}' が同一ファイル内で再定義されている",
            )

    for func, locs in func_defs.items():
        if len(locs) <= 1:
            continue
        globals_ = [p for p, is_static in locs if not is_static]
        if len(globals_) > 1:
            detail = "\n        ".join(p.name for p in globals_)
            yield _err(
                None,
                None,
                f"グローバル関数 '{func}' が多重定義されている",
                detail,
            )
        else:
            detail = "\n        ".join(
                f"{p.name} ({'static' if s else 'global'})" for p, s in locs
            )
            yield _warn(
                None,
                None,
                f"関数 '{func}' の名前が複数ファイルで衝突している",
                detail,
            )


# --------------------------------------------------------------------------- #
# マジックナンバー（可読性）：0 / 1 / -1 以外の直書き数値
# --------------------------------------------------------------------------- #

_C_LITERAL_RE = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')
_NUMBER_RE = re.compile(
    r"(?<![A-Za-z0-9_])"
    r"-?(?:0[xX][0-9A-Fa-f]+|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)"
    r"[uUlLfF]*"
    r"(?![A-Za-z0-9_])"
)
_MAGIC_IGNORE_RE = re.compile(r"clint:ignore\s+magic\b(.*)")
_DECIMAL_DIGIT_CHARS = ("'0'", "'9'", '"0123456789"')
_HEADER_FUNC_DECL_RE = re.compile(r"^[^\n;{]+\n\t([a-zA-Z_]\w*)\s*\([^;{]*?\);", re.MULTILINE)
_GLOBAL_FUNC_ALLOWLIST = frozenset({"main"})


def _remove_c_literals(line: str) -> str:
    return _C_LITERAL_RE.sub(lambda m: " " * (m.end() - m.start()), line)


def _strip_number_suffix(token: str) -> str:
    while token and token[-1] in "uUlLfF":
        token = token[:-1]
    return token


def _number_value(token: str) -> float | int | None:
    core = _strip_number_suffix(token)
    try:
        if core.lower().startswith("0x") or core.lower().startswith("-0x"):
            return int(core, 16)
        if "." in core or "e" in core.lower():
            return float(core)
        return int(core, 10)
    except ValueError:
        return None


def _next_nonspace(code: str, pos: int) -> str:
    while pos < len(code) and code[pos].isspace():
        pos += 1
    if pos >= len(code):
        return ""
    return code[pos]


def _prev_nonspace(code: str, pos: int) -> str:
    pos -= 1
    while pos >= 0 and code[pos].isspace():
        pos -= 1
    if pos < 0:
        return ""
    return code[pos]


def _is_array_subscript(code: str, start: int, end: int) -> bool:
    open_idx = code.rfind("[", 0, start)
    close_before = code.rfind("]", 0, start)
    if open_idx == -1 or close_before > open_idx:
        return False
    close_idx = code.find("]", end)
    return close_idx != -1


def _is_bit_shift_count(code: str, start: int, end: int) -> bool:
    before = code[max(0, start - 4):start]
    after = code[end:end + 4]
    return "<<" in before or ">>" in before or "<<" in after or ">>" in after


def _is_bit_field_width(code: str, token: str) -> bool:
    value = _number_value(token)
    if value not in (8, 16, 24, 32):
        return False
    return "<<" in code or ">>" in code or "0x" in code.lower()


def _is_digit_conversion(raw_line: str, code: str, token: str) -> bool:
    value = _number_value(token)
    if value not in (9, 10):
        return False
    if any(marker in raw_line for marker in _DECIMAL_DIGIT_CHARS):
        return True
    if value == 10 and re.search(r"(?:%|/)\s*10\b|(?:%|/)\s*=\s*10\b", code):
        return True
    if value == 9 and re.search(r">\s*9\b", code):
        return True
    return False


def _is_coordinate_center(token: str) -> bool:
    value = _number_value(token)
    return value == 0.5


def _is_zero_or_one(token: str) -> bool:
    value = _number_value(token)
    return value in (-1, 0, 1)


def _is_common_float_formula(token: str) -> bool:
    value = _number_value(token)
    return value == 2.0 and "." in _strip_number_suffix(token)


def _is_half_expression(code: str, start: int, end: int, token: str) -> bool:
    if _number_value(token) != 2:
        return False
    return _prev_nonspace(code, start) == "/" or _next_nonspace(code, end) == "/"


def _is_full_circle_factor(code: str, start: int, end: int, token: str) -> bool:
    if _number_value(token) != 2:
        return False
    return "M_PI" in code and (_prev_nonspace(code, start) == "*" or _next_nonspace(code, end) == "*")


def _is_allowed_magic_literal(raw_line: str, code: str, match: re.Match) -> bool:
    token = match.group(0)
    core = _strip_number_suffix(token)
    if _is_zero_or_one(token):
        return True
    if core.lower().startswith("0x") or core.lower().startswith("-0x"):
        return True
    if _is_array_subscript(code, match.start(), match.end()):
        return True
    if _is_bit_shift_count(code, match.start(), match.end()):
        return True
    if _is_bit_field_width(code, token):
        return True
    if _is_digit_conversion(raw_line, code, token):
        return True
    if _is_coordinate_center(token):
        return True
    if _is_common_float_formula(token):
        return True
    if _is_half_expression(code, match.start(), match.end(), token):
        return True
    if _is_full_circle_factor(code, match.start(), match.end(), token):
        return True
    return False


@check("magic", "CR016: 0/1/-1 以外の直書き数値（マジックナンバー）を検出")
def check_magic_numbers(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs",), (".c",)):
        clean_lines = sf.no_comments.splitlines()
        raw_lines = sf.raw.splitlines()
        for n, line in enumerate(clean_lines, 1):
            raw_line = raw_lines[n - 1] if n <= len(raw_lines) else line
            ignore = _MAGIC_IGNORE_RE.search(raw_line)
            if ignore:
                if ignore.group(1).strip():
                    continue
                yield _warn(
                    sf.path,
                    n,
                    "clint:ignore magic に理由がない",
                    "例: // clint:ignore magic ミリ秒変換",
                )
                continue
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            code = _remove_c_literals(line)
            numbers = []
            for m in _NUMBER_RE.finditer(code):
                if not _is_allowed_magic_literal(raw_line, code, m):
                    numbers.append(m.group(0))
            if numbers:
                yield _warn(
                    sf.path,
                    n,
                    "マジックナンバーを検出",
                    f"{s}  →  {', '.join(numbers)}",
                )


# --------------------------------------------------------------------------- #
# CR015: return 文の返却式
# --------------------------------------------------------------------------- #

_RETURN_RE = re.compile(r"^return(?:\s+(.*?))?\s*;$")


@check("return-parens", "CR015: return 文の返却式を括弧で囲む")
def check_return_parens(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        for n, line in enumerate(sf.no_comments_strings.splitlines(), 1):
            s = line.strip()
            m = _RETURN_RE.match(s)
            if not m:
                continue
            expr = m.group(1)
            if expr is None or not expr.strip():
                continue
            expr = expr.strip()
            if expr.startswith("(") and expr.endswith(")"):
                continue
            yield _err(
                sf.path,
                n,
                "return 文の返却式が括弧で囲まれていない",
                f"{s} → return ({expr});",
            )


# --------------------------------------------------------------------------- #
# 未使用関数（デッドコード）：どこからも呼ばれていない関数
# --------------------------------------------------------------------------- #


@check("unused", "CR014: どこからも呼ばれていない関数（デッドコード）を検出")
def check_unused_funcs(ctx: Context) -> Iterable[Finding]:
    files = ctx.select(("srcs",), (".c",))
    defined: dict[str, "object"] = {}
    blobs: list[str] = []

    for sf in files:
        blobs.append(sf.no_comments)
        for m in FUNC_DEF_RE.finditer(sf.no_comments):
            defined[m.group(2)] = sf.path

    blob = "\n".join(blobs)
    for func, path in defined.items():
        if func == "main":
            continue
        # 定義 1 回ぶんしか出現しない＝呼び出しがない
        if len(re.findall(rf"\b{func}\b", blob)) <= 1:
            yield _warn(path, None, f"未使用関数 '{func}' は一度も呼ばれていない")


# --------------------------------------------------------------------------- #
# static 漏洩（カプセル化）：.c の static 関数が .h に公開されていないか
# --------------------------------------------------------------------------- #


@check("static-leak", "CR011: .c の static 関数が .h に漏れていないか")
def check_static_leak(ctx: Context) -> Iterable[Finding]:
    static_funcs: dict[str, "object"] = {}
    for sf in ctx.select(("srcs",), (".c",)):
        for func_name in STATIC_DEF_RE.findall(sf.no_comments):
            static_funcs[func_name] = sf.path

    for sf in ctx.select(("includes",), (".h",)):
        clean = sf.no_comments
        for func_name, src_path in static_funcs.items():
            decl_re = re.compile(rf"^[^\n]+\n\t{func_name}\s*\(", re.MULTILINE)
            if decl_re.search(clean):
                yield _err(
                    sf.path,
                    None,
                    f"static 関数 '{func_name}' がヘッダに漏れている",
                    f"定義元: {src_path.name}",
                )


# --------------------------------------------------------------------------- #
# static 不足（カプセル化）：ヘッダ非公開の .c 関数は static にする
# --------------------------------------------------------------------------- #


@check("missing-static", "CR011: ヘッダ非公開の .c 関数に static が付いているか")
def check_missing_static(ctx: Context) -> Iterable[Finding]:
    public_funcs: set[str] = set()

    for sf in ctx.select(("includes",), (".h",)):
        public_funcs.update(_HEADER_FUNC_DECL_RE.findall(sf.no_comments))

    for sf in ctx.select(("srcs",), (".c",)):
        for m in FUNC_DEF_RE.finditer(sf.no_comments):
            ret_type = m.group(1).strip()
            func_name = m.group(2)
            if func_name in _GLOBAL_FUNC_ALLOWLIST:
                continue
            if "static" in ret_type.split():
                continue
            if func_name in public_funcs:
                continue
            line = sf.no_comments.count("\n", 0, m.start()) + 1
            yield _err(
                sf.path,
                line,
                f"関数 '{func_name}' がヘッダ非公開なのに static ではない",
                "外部公開しないなら static、公開するなら適切なヘッダに宣言する",
            )


# --------------------------------------------------------------------------- #
# CR010: include guard
# --------------------------------------------------------------------------- #


def _expected_guards(sf) -> set[str]:
    rel = sf.path.relative_to(sf.root / "includes").with_suffix("")
    stem = re.sub(r"[^A-Za-z0-9]+", "_", sf.path.stem).upper()
    path_name = re.sub(r"[^A-Za-z0-9]+", "_", rel.as_posix()).upper()
    return {f"{stem}_H", f"{path_name}_H"}


def _guard_value(line: str, directive: str) -> str | None:
    m = re.match(rf"^#\s*{directive}\s+([A-Z][A-Z0-9_]*_H)$", line.strip())
    if not m:
        return None
    return m.group(1)


@check("header-guard", "CR010: ヘッダに正しい include guard があるか")
def check_header_guard(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("includes",), (".h",)):
        expected = _expected_guards(sf)
        lines = [(i, line.strip()) for i, line in enumerate(sf.raw.splitlines(), 1) if line.strip()]
        if len(lines) < 3:
            yield _err(sf.path, None, "ヘッダが短すぎて include guard を確認できない")
            continue
        ifndef_idx = next((i for i, (_, line) in enumerate(lines) if line.startswith("#ifndef")), None)
        if ifndef_idx is None or ifndef_idx + 1 >= len(lines):
            yield _err(sf.path, None, "include guard の #ifndef / # define が見つからない")
            continue
        ifndef_line_no, ifndef_line = lines[ifndef_idx]
        define_line_no, define_line = lines[ifndef_idx + 1]
        ifndef_guard = _guard_value(ifndef_line, "ifndef")
        define_guard = _guard_value(define_line, "define")
        if ifndef_guard not in expected:
            yield _err(sf.path, ifndef_line_no, "include guard の #ifndef が不正", f"期待値: {' または '.join(sorted(expected))}")
        if define_guard != ifndef_guard:
            yield _err(sf.path, define_line_no, "include guard の # define が #ifndef と一致しない")
        if lines[-1][1] != "#endif":
            yield _err(sf.path, lines[-1][0], "include guard の末尾 #endif が無い")


# --------------------------------------------------------------------------- #
# 依存方向（レイヤリング）：common は fps 専用ヘッダを include してはいけない
# --------------------------------------------------------------------------- #

#: fps 専用ヘッダ（common から include されたら違反）。B2 で fps/includes/ へ
#: 移す対象でもある。enemy/enemy_types.h は common 側のデータモデルなので除外。
_FPS_ONLY_HEADERS: frozenset[str] = frozenset(
    {
        "enemy/enemy.h",
        "enemy/enemy_utils.h",
    }
)

#: #include "..." の取り込み先パスを取り出す（山括弧 <> の標準ヘッダは対象外）
_LOCAL_INCLUDE_RE = re.compile(r'^\s*#\s*include\s+"([^"]+)"')


@check("layering", "CR012: common はモード固有ヘッダに依存してはいけない")
def check_layering(ctx: Context) -> Iterable[Finding]:
    for sf in ctx.select(("srcs", "includes"), (".c", ".h")):
        # 検査対象は common 側のファイルのみ。fps 側は fps ヘッダを使ってよい
        if not sf.rel.startswith("common/"):
            continue
        for n, line in enumerate(sf.raw.splitlines(), 1):
            m = _LOCAL_INCLUDE_RE.match(line)
            if not m:
                continue
            target = m.group(1)
            if target in _FPS_ONLY_HEADERS:
                yield _err(
                    sf.path,
                    n,
                    "common→fps の禁止された依存",
                    f'#include "{target}" は fps 専用。'
                    f"common からは enemy/enemy_types.h を使う",
                )
