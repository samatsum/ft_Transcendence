# CODING_RULES - cub3D C Coding Rules

> Source: translated from the Japanese original at md_files/04_エンジン資料/コーディング規約.md (archived).

This document is the canonical source for cub3D's C coding rules. `make check` verifies CR001–CR015; if it fails, you must fix it.
`make audit` runs CR001–CR016 and also displays advisory-level items such as CR016. CR017 and beyond are confirmed via human review.

## Review Criteria

Code review checks not just formatting, but also the following.

1. Module relationships and granularity
   - Functions and files should be split at close to single-responsibility granularity.
   - High cohesion, low coupling — mode-specific specifications should not leak excessively into `common`.
   - Avoid unnecessary global state or external linkage; keep the scope of side effects small.

2. Complexity, readability, maintainability
   - Avoid excessive nesting; use early `return` to keep code readable.
   - Magic numbers should be moved to either a private constant in the `.c` file or a shared constant in the `.h` file, depending on usage.
   - Names should express the role of the thing they name, so intent is clear when read from the call site.

3. Safety and robustness
   - Check the return values of `malloc`-family calls.
   - Do not leak `free` / `close` / MLX resource cleanup on failure paths.
   - Avoid undefined behavior such as buffer overflows, uninitialized values, and NULL dereferences.

## Targets of `make check`: CR001–CR015

### CR001: 42 header is not required

The 42 header at the top of a file is not required in this repository. Do not include it in newly added or generated code.

### CR002: include order

Place standard headers `<...>` first, followed by your own headers `"..."`.

### CR003: indentation and whitespace

Use tabs for indentation. Put a half-width space between `if` / `for` / `while` and `(`. Also add readable spaces around operators.

### CR004: pointer notation

Put `*` next to the type name. Place `const` before the type name as a general rule.
Only use the `* const` form when the pointer variable itself must be made non-modifiable.

```c
int*	ptr;
const char*	name;
char* const	buffer;
const char* const	label;
```

### CR005: signatures and prototypes

Split the return type and the function name onto separate lines. Indent the line with the function name and arguments with one tab.

```c
static int
	parse_value(const char* src, int* out);
```

### CR006: braces and else

Place a function's opening `{` on the next line; place a control statement's opening `{` at the end of the same line. Never omit `{}` even for a single-line body.
Write `else` as `} else {` or `} else if (...) {`.

### CR007: end of file

End the file with exactly one newline.

### CR008: `.c` separators

Place the following separator between the `#include` block and the prototype declarations or file-local constants, and immediately before every function definition.

```c
/* ************************************************************************** */
```

### CR009: `.c` layout order and function comments

Gather prototype declarations at the top. Place function definitions top-down starting with public functions, and align the order of prototype declarations with the definition order as a general rule.
Immediately before each function definition, below the separator, write a short `//` comment in Japanese.

### CR010: include guard

Headers must have an uppercase include guard. The base form is `FILENAME_H`, derived from the file name.
When you need to avoid name collisions, a directory-prefixed form such as `UI_FONT_H` is also allowed.

```c
#ifndef CONFIG_H
# define CONFIG_H

#endif
```

### CR011: static and public API

Functions used only within a `.c` file must be `static`. Do not declare `static` functions in a header. Functions exposed externally must have their prototype placed in the appropriate header.

### CR012: layering

`common` must not depend directly on mode-specific implementations. FPS/RSP-specific behavior must be moved into mode ops or mode-side functions.

### CR013: duplicate definitions and name collisions

Do not duplicate macro or global function definitions across multiple files. Even for `static` functions, if the same name appears in another file, give it a name that makes the intent clear.

### CR014: unused functions

Do not leave functions that are called from nowhere. Do not leave dead code intended for future use; add it only when it is actually needed.

### CR015: expression in `return` statements

For `return` statements that return a value, the returned expression must always be enclosed in parentheses. A value-less `return ;` is allowed.

```c
return (0);
return (ptr);
return (a + b);
return ;
```

The following forms are prohibited.

```c
return 0;
return ptr;
return a + b;
```

## Target of `make audit`: CR016

### CR016: magic numbers

Numeric literals other than `0` / `1` / `-1` should, as a general rule, be turned into named constants. This rule is treated as advisory by `make audit`.

The following values are excluded from detection, to reduce noise.

- Numbers inside character literals and string literals
- Numbers inside identifiers (e.g. `clamp_255`)
- Numbers used for array subscripts and array sizes (e.g. `paths[2]`, `buf[256]`)
- `0.5` / `.5` used for coordinate centers
- `2.0` / `2.` / `/ 2` used in geometric calculations
- Hexadecimal literals, bit-shift widths, and bitwise values such as RGB
- `9` / `10` used in decimal string conversion

Numbers left in intentionally may be excluded on a per-line basis, with a reason.

```c
value = 1000; // clint:ignore magic ミリ秒変換
```

A `clint:ignore magic` without a reason is treated as a warning.

## Targets of human review: CR017–CR021

### CR017: alignment via tabs

Align variable declarations, struct members, and macro constants vertically using tabs. One variable per line is the basic rule. Group variables of the same type or qualifier close together.

### CR018: description order within headers

Within a header, place items in the order: include block, macro constants, structs/enums/typedefs, prototype declarations.
Structs should generally follow the `typedef struct s_name { ... } t_name;` form.

### CR019: header separators

Headers also use the same separator as `.c` files, placed between major groupings. It does not have to be placed before every single prototype — it may instead be placed once per grouping of related public API.

### CR020: header comments

Public macros, public types, and groups of public API should have a short `//` comment describing their role attached. Do not force a comment on every self-evident one-line prototype.

### CR021: choosing the right medium for information (How / What / Why / Why not)

Write information in the medium that matches its lifespan and its readers.

| Medium | What to write | Example |
|---|---|---|
| Code | **How** — intent should be readable from names and structure | `bfs_to_nearest_patrol()` |
| Test / verification code | **What** — what is guaranteed | "Parse results are identical before and after the refactor, for all `.cub` files." |
| Commit log | **Why** — why this change was made. Reference design decisions by D-xx or a design-doc section number | "Unified collision handling into the move_camera family. Keeping two separate systems would become a source of inconsistency once combatants are integrated (① §3-C-2)." |
| Inline comment | **Why not** — why the code is not written the straightforward way. Constraints not visible from the code | "// Disable the field-of-view gate while chasing: by spec, the target must still be trackable for a while even after circling behind." |

- Do not write inline comments that merely explain "what the next line does" (this duplicates the code's own How).
- **Exception**: the short Japanese comment required immediately before each function by CR009, and the header comments required by CR020, continue to be written as **What, for public API**, as before.
  This rule (CR021) applies to inline comments and commit logs.

## Lint mapping table

| Check name | Corresponding rule | Scope | Notes |
|---|---|---|---|
| `no-42-header` | CR001 | check | 42 header not required |
| `includes` | CR002 | check | include order |
| `style` | CR003 / CR006 / CR007 | check | whitespace, else, trailing newline |
| `pointer` | CR004 | check | pointer notation |
| `signatures` | CR005 | check | function definition / prototype form |
| `separators` | CR008 / CR009 | check | separator and comment before each function |
| `header-guard` | CR010 | check | include guard |
| `static-leak` | CR011 | check | static function leaking into header |
| `missing-static` | CR011 | check | missing static on a function not exposed in a header |
| `layering` | CR012 | check | dependency from common to mode-specific code |
| `duplicates` | CR013 | check | macro / function duplication |
| `unused` | CR014 | check | unused functions |
| `return-parens` | CR015 | check | expression in return statements |
| `magic` | CR016 | audit | advisory item for `make audit` |

## What lint does not fully judge

CR017–CR021, and the review-criteria items on cohesion/coupling, complexity, and the appropriateness of resource cleanup, are confirmed via human review. Lint checks for these may be added in the future if needed.
