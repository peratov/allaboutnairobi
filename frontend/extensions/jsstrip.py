"""
Strip comments and indentation from the browser modules, and nothing else.

The modules are written to be read - a third of their bytes are comments - and
they shipped exactly as written. Ursus's own minifier only touches inline
scripts, and its library, rjsmin, cannot be pointed at these files: it loses
track inside a template literal nested in another one, and drops the spaces
there. That turned `class: ` + "` is-${x}`" into "`is-${x}`" in ten modules and
"` 0 R`" into "`0 R`" in the PDF writer - every result still parses, so a
syntax check passes and the page is wrong.

So this is deliberately less ambitious. It tokenises just enough to know
whether it is in code, a string, a template literal (to any depth), a regular
expression or a comment, and then:

- drops comments,
- drops indentation, trailing spaces and blank lines,
- collapses other runs of spaces in code to one,
- keeps every line break, so automatic semicolon insertion sees exactly the
  lines it saw before.

Strings, template literals and regular expressions are copied byte for byte.

`scripts/check_js_strip.mjs` (`mise check-js`) proves it on the real files: it
parses every module before and after with the JavaScript parser inside Node
and compares the trees. Run it after changing this file.
"""

# After these a slash starts a regular expression rather than dividing.
REGEX_AFTER_WORDS = {
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "throw", "case", "do", "else", "yield", "await",
}
REGEX_AFTER_PUNCTUATION = set("(,=:[!&|?{};+-*%<>~^")


def strip_js(source: str) -> str:
    out: list[str] = []
    i, n = 0, len(source)
    # One entry per open `${`: the count of `{` opened inside that
    # expression and not yet closed. The `}` that finds it at zero is the
    # one that returns to the template literal.
    template_braces: list[int] = []
    last = ""  # the last significant token, for regex detection
    pending_space = False
    line_has_code = False

    def emit(text: str) -> None:
        nonlocal pending_space, line_has_code
        if pending_space and line_has_code:
            out.append(" ")
        pending_space = False
        out.append(text)
        line_has_code = True

    def newline() -> None:
        nonlocal pending_space, line_has_code
        pending_space = False
        if line_has_code:
            out.append("\n")
        line_has_code = False

    def scan_template(start: int) -> int:
        """From just after a backtick or a closing `}`, copy literal text up
        to the closing backtick or the next `${`. Returns the index after it.
        """
        nonlocal last
        j = start
        while j < n:
            c = source[j]
            if c == "\\":
                j += 2
                continue
            if c == "`":
                out.append(source[start : j + 1])
                last = "literal"
                return j + 1
            if c == "$" and j + 1 < n and source[j + 1] == "{":
                out.append(source[start : j + 2])
                template_braces.append(0)
                last = "{"
                return j + 2
            j += 1
        raise ValueError("unterminated template literal")

    while i < n:
        c = source[i]

        if c == "\n":
            newline()
            i += 1
            continue
        if c in " \t\r\f\v ﻿":
            pending_space = True
            i += 1
            continue

        # Comments.
        if c == "/" and i + 1 < n and source[i + 1] == "/":
            end = source.find("\n", i)
            i = n if end == -1 else end
            continue
        if c == "/" and i + 1 < n and source[i + 1] == "*":
            end = source.find("*/", i + 2)
            if end == -1:
                raise ValueError("unterminated block comment")
            # A comment spanning lines counts as a line break for automatic
            # semicolon insertion, so it has to leave one behind.
            if "\n" in source[i:end]:
                newline()
            else:
                pending_space = True
            i = end + 2
            continue

        # Strings.
        if c in "'\"":
            j = i + 1
            while j < n and source[j] != c:
                if source[j] == "\\":
                    j += 1
                elif source[j] == "\n":
                    raise ValueError("unterminated string")
                j += 1
            emit(source[i : j + 1])
            last = "literal"
            i = j + 1
            continue

        # Template literals, and the end of an expression inside one.
        if c == "`":
            emit("`")
            i = scan_template(i + 1)
            continue
        if c == "}" and template_braces and template_braces[-1] == 0:
            template_braces.pop()
            emit("}")
            i = scan_template(i + 1)
            continue
        if c == "{" and template_braces:
            template_braces[-1] += 1
        elif c == "}" and template_braces:
            template_braces[-1] -= 1

        # Regular expressions.
        if c == "/" and (last == "" or last in REGEX_AFTER_PUNCTUATION or last in REGEX_AFTER_WORDS):
            j = i + 1
            in_class = False
            while j < n:
                d = source[j]
                if d == "\\":
                    j += 2
                    continue
                if d == "\n":
                    raise ValueError("unterminated regular expression")
                if d == "[":
                    in_class = True
                elif d == "]":
                    in_class = False
                elif d == "/" and not in_class:
                    break
                j += 1
            j += 1
            while j < n and (source[j].isalnum() or source[j] in "_$"):
                j += 1
            emit(source[i:j])
            last = "literal"
            i = j
            continue

        # Words and numbers.
        if c.isalnum() or c in "_$#" or ord(c) > 127:
            j = i + 1
            while j < n and (source[j].isalnum() or source[j] in "_$" or ord(source[j]) > 127):
                j += 1
            # A number ends here at a decimal point, which then passes through
            # as punctuation; nothing is ever inserted between them.
            word = source[i:j]
            emit(word)
            last = word if not word[0].isdigit() else "literal"
            i = j
            continue

        # Punctuation, one character at a time.
        emit(c)
        last = c
        i += 1

    newline()
    return "".join(out)
