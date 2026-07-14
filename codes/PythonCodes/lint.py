#!/usr/bin/env python3
"""lint — clint の単一エントリポイント。

旧来は 9 本のスクリプトを個別に実行していたが、これ 1 本で全検査を
まとめて走らせ、統一フォーマットで結果を出力し、終了コードを 1 つに集約する。

使い方:
    python3 lint.py                 # 全検査を実行
    python3 lint.py --list          # 検査一覧を表示
    python3 lint.py --select style,pointer
    python3 lint.py --strict        # WARNING も失敗（終了コード 1）扱いにする
    python3 lint.py --root ../      # プロジェクトルートを明示
    python3 lint.py --fix           # 不足セパレータ/コメント雛形("TODO: 関数の説明を記述する")を自動挿入してから検査
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import List

# このスクリプト自身のディレクトリを import 検索パスの先頭へ追加する。
# make 等で別ディレクトリから呼ばれても、隣の checks.py / cutils.py を確実に解決できる。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from checks import CHECKS, Check
from cutils import Context, Finding, Severity, find_project_root, fix_separators

_CR_RE = re.compile(r"CR(\d+)")


def cr_key(chk: Check) -> tuple[int, str]:
    m = _CR_RE.search(chk.summary)
    if not m:
        return (999, chk.name)
    return (int(m.group(1)), chk.name)


# 端末が色対応のときだけ ANSI を使う
def _supports_color() -> bool:
    return sys.stdout.isatty()


class _C:
    def __init__(self, enabled: bool) -> None:
        self.RED = "\033[31m" if enabled else ""
        self.YEL = "\033[33m" if enabled else ""
        self.GRN = "\033[32m" if enabled else ""
        self.DIM = "\033[2m" if enabled else ""
        self.END = "\033[0m" if enabled else ""


# --------------------------------------------------------------------------- #
# 引数解析
# --------------------------------------------------------------------------- #


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="lint",
        description="cub3D 用 C コーディングルール静的解析リンタ (clint)",
    )
    p.add_argument(
        "--root",
        type=Path,
        default=None,
        help="プロジェクトルート（既定: srcs/ と includes/ を自動探索）",
    )
    p.add_argument(
        "--select",
        default=None,
        help="実行する検査名をカンマ区切りで指定（例: style,pointer）",
    )
    p.add_argument(
        "--strict", action="store_true", help="WARNING も失敗（終了コード 1）として扱う"
    )
    p.add_argument(
        "--fix",
        action="store_true",
        help="不足しているセパレータ/コメント雛形を実ファイルへ自動挿入する",
    )
    p.add_argument(
        "--list", action="store_true", help="利用可能な検査の一覧を表示して終了する"
    )
    p.add_argument(
        "--quiet", action="store_true", help="個別の指摘を抑制し、サマリだけ表示する"
    )
    return p.parse_args(argv)


def select_checks(selector: str | None) -> List[Check]:
    if not selector:
        return sorted(CHECKS, key=cr_key)
    registry = {c.name: c for c in CHECKS}
    wanted = [name.strip() for name in selector.split(",") if name.strip()]
    unknown = [name for name in wanted if name not in registry]
    if unknown:
        names = ", ".join(sorted(set(unknown)))
        raise SystemExit(f"不明な検査名: {names}\n--list で一覧を確認してください。")
    return [registry[name] for name in wanted]


# --------------------------------------------------------------------------- #
# 出力
# --------------------------------------------------------------------------- #


def print_finding(f: Finding, root: Path, c: _C) -> None:
    tag = (
        c.RED + "ERROR " + c.END
        if f.severity is Severity.ERROR
        else c.YEL + "WARN  " + c.END
    )
    print(f"        {tag} {f.location(root)}  {f.message}")
    if f.detail:
        print(f"{c.DIM}               {f.detail}{c.END}")


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    c = _C(_supports_color())

    if args.list:
        print("利用可能な検査:")
        for chk in sorted(CHECKS, key=cr_key):
            print(f"  {chk.name:<14} {chk.summary}")
        return 0

    root = (args.root or find_project_root()).resolve()
    checks = select_checks(args.select)

    print(f"clint — C coding-rule linter")
    print(f"project root: {root}\n")

    ctx = Context(root)

    # --fix: 不足セパレータ/コメント雛形を実ファイルへ挿入してから検査する
    if args.fix:
        changed = 0
        for sf in ctx.select(("srcs",), (".c",)):
            notices = fix_separators(sf)
            if notices:
                changed += 1
                print(f"{c.GRN}fixed{c.END} {sf.rel}")
                for note in notices:
                    print(f"        + {note}")
        if changed:
            print(
                f"\n{changed} file(s) updated. "
                f"'TODO' 雛形コメントは内容を埋めてください。\n"
            )
        else:
            print("挿入の必要な箇所はありませんでした。\n")
        # 書き換え後の状態で検査するため context を作り直す
        ctx = Context(root)

    total_err = 0
    total_warn = 0

    for chk in checks:
        findings = chk.run(ctx)
        errors = sum(1 for f in findings if f.severity is Severity.ERROR)
        warns = sum(1 for f in findings if f.severity is Severity.WARNING)
        total_err += errors
        total_warn += warns

        if not findings:
            status = c.GRN + "[OK]  " + c.END
        elif errors:
            status = c.RED + "[FAIL]" + c.END
        else:
            status = c.YEL + "[WARN]" + c.END
        print(f"{status} {chk.name:<14} {chk.summary}")

        if findings and not args.quiet:
            for f in findings:
                print_finding(f, root, c)

    print()
    print(
        f"Summary: {len(checks)} checks, "
        f"{total_err} error(s), {total_warn} warning(s)"
    )

    failed = total_err > 0 or (args.strict and total_warn > 0)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
