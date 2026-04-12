#!/usr/bin/env python3
"""
Build script for the Frida course reveal.js presentation.

Reads markdown slide files from slides/, converts them to HTML,
and generates a reveal.js presentation using template.html.

Requires only Python 3 standard library -- no external packages.

Usage:
    python3 build.py                  # Build full presentation
    python3 build.py --modules        # Also build per-module HTML files
    python3 build.py --presenter      # Also build presenter version
    python3 build.py --all            # Build everything
"""

import glob
import html
import os
import re
import sys
import textwrap
from pathlib import Path


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SLIDES_DIR = Path(__file__).parent / "slides"
TEMPLATE_FILE = Path(__file__).parent / "template.html"
OUTPUT_FILE = Path(__file__).parent / "presentation.html"
OUTPUT_DIR = Path(__file__).parent / "output"
PRESENTER_FILE = Path(__file__).parent / "presentation-presenter.html"

SLIDE_GLOB = "0*.md"
SLIDE_SEPARATOR = "\n---\n"


# ---------------------------------------------------------------------------
# Lightweight Markdown-to-HTML Converter (no external dependencies)
# ---------------------------------------------------------------------------

class MarkdownConverter:
    """
    Converts a subset of Markdown to HTML suitable for reveal.js slides.

    Supports:
    - Headings (# through ######)
    - Fenced code blocks (``` with optional language)
    - Inline code (`code`)
    - Bold (**text** and __text__)
    - Italic (*text* and _text_)
    - Unordered lists (-, *, +)
    - Ordered lists (1. 2. 3.)
    - Nested lists (indented by 2+ spaces)
    - Tables (pipe-delimited)
    - Blockquotes (> text)
    - Links [text](url)
    - Images ![alt](src)
    - Horizontal rules (---, ***, ___)
    - Inline HTML (passed through)
    """

    def convert(self, text: str) -> str:
        """Convert markdown text to HTML."""
        lines = text.split("\n")
        result = []
        i = 0

        while i < len(lines):
            line = lines[i]

            # Fenced code block
            if line.strip().startswith("```"):
                block, i = self._parse_code_block(lines, i)
                result.append(block)
                continue

            # Table (line with pipes, followed by separator line)
            if "|" in line and i + 1 < len(lines) and re.match(
                r"^\s*\|?[\s\-:|]+\|", lines[i + 1]
            ):
                table, i = self._parse_table(lines, i)
                result.append(table)
                continue

            # Blockquote
            if line.strip().startswith(">"):
                block, i = self._parse_blockquote(lines, i)
                result.append(block)
                continue

            # Heading
            m = re.match(r"^(#{1,6})\s+(.+)$", line)
            if m:
                level = len(m.group(1))
                content = self._inline(m.group(2))
                result.append(f"<h{level}>{content}</h{level}>")
                i += 1
                continue

            # Unordered list
            if re.match(r"^(\s*)([-*+])\s+", line):
                block, i = self._parse_list(lines, i, ordered=False)
                result.append(block)
                continue

            # Ordered list
            if re.match(r"^(\s*)\d+\.\s+", line):
                block, i = self._parse_list(lines, i, ordered=True)
                result.append(block)
                continue

            # Horizontal rule
            if re.match(r"^\s*([-*_])\s*\1\s*\1[\s\-*_]*$", line.strip()) and len(line.strip()) >= 3:
                result.append("<hr>")
                i += 1
                continue

            # Empty line
            if line.strip() == "":
                i += 1
                continue

            # Paragraph (collect consecutive non-empty non-special lines)
            para, i = self._parse_paragraph(lines, i)
            result.append(para)

        return "\n".join(result)

    # -- Block parsers --

    def _parse_code_block(self, lines, i):
        """Parse a fenced code block starting at line i."""
        opening = lines[i].strip()
        lang_match = re.match(r"^```(\w+)?", opening)
        lang = lang_match.group(1) if lang_match and lang_match.group(1) else ""
        i += 1
        code_lines = []
        while i < len(lines):
            if lines[i].strip() == "```":
                i += 1
                break
            code_lines.append(lines[i])
            i += 1

        code_text = html.escape("\n".join(code_lines))

        if lang:
            lang_class = f'class="language-{lang}"'
            data_lang = f' data-lang="{lang}"'
        else:
            lang_class = 'class="nohighlight"'
            data_lang = ""

        return f"<pre{data_lang}><code {lang_class} data-trim data-noescape>{code_text}</code></pre>", i

    def _parse_table(self, lines, i):
        """Parse a markdown table starting at line i."""
        rows = []
        while i < len(lines) and "|" in lines[i]:
            cells = self._parse_table_row(lines[i])
            if cells is not None:
                rows.append(cells)
            i += 1
            # Skip separator row (---|---|---)
            if rows and len(rows) == 1 and i < len(lines):
                if re.match(r"^\s*\|?[\s\-:|]+\|", lines[i]):
                    i += 1

        if not rows:
            return "", i

        html_parts = ["<table>"]

        # Header
        html_parts.append("<thead><tr>")
        for cell in rows[0]:
            html_parts.append(f"<th>{self._inline(cell)}</th>")
        html_parts.append("</tr></thead>")

        # Body
        if len(rows) > 1:
            html_parts.append("<tbody>")
            for row in rows[1:]:
                html_parts.append("<tr>")
                for cell in row:
                    html_parts.append(f"<td>{self._inline(cell)}</td>")
                html_parts.append("</tr>")
            html_parts.append("</tbody>")

        html_parts.append("</table>")
        return "\n".join(html_parts), i

    def _parse_table_row(self, line):
        """Parse a single table row, return list of cell contents or None."""
        line = line.strip()
        if not "|" in line:
            return None
        # Remove leading/trailing pipes
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        # Check if it's a separator row
        if re.match(r"^[\s\-:|]+$", line):
            return None
        return [cell.strip() for cell in line.split("|")]

    def _parse_blockquote(self, lines, i):
        """Parse a blockquote block."""
        bq_lines = []
        while i < len(lines) and (lines[i].strip().startswith(">") or
               (lines[i].strip() != "" and bq_lines)):
            line = lines[i]
            # Remove > prefix
            stripped = re.sub(r"^\s*>\s?", "", line)
            if not lines[i].strip().startswith(">") and lines[i].strip() == "":
                break
            bq_lines.append(stripped)
            i += 1

        content = self._inline("\n".join(bq_lines).strip())
        # Wrap lines in <p> tags if they contain newlines
        paragraphs = content.split("\n")
        inner = "".join(f"<p>{p}</p>" for p in paragraphs if p.strip())
        return f"<blockquote>{inner}</blockquote>", i

    def _parse_list(self, lines, i, ordered=False):
        """Parse a list (ordered or unordered), handling nesting."""
        items = []
        base_indent = len(lines[i]) - len(lines[i].lstrip())

        if ordered:
            pattern = re.compile(r"^(\s*)\d+\.\s+(.*)")
        else:
            pattern = re.compile(r"^(\s*)([-*+])\s+(.*)")

        while i < len(lines):
            line = lines[i]

            # Empty line might end the list or be part of a loose list
            if line.strip() == "":
                # Check if next line continues the list
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    if ordered:
                        if re.match(r"^\s*\d+\.\s+", next_line):
                            i += 1
                            continue
                    else:
                        if re.match(r"^\s*([-*+])\s+", next_line):
                            i += 1
                            continue
                break

            m = pattern.match(line)
            if m:
                indent = len(m.group(1))
                if indent < base_indent:
                    break
                if indent > base_indent:
                    # Nested list: recurse
                    sublist, i = self._parse_list(lines, i, ordered=self._detect_list_type(line))
                    if items:
                        items[-1] = items[-1] + "\n" + sublist
                    else:
                        items.append(sublist)
                    continue
                content = m.group(3) if not ordered else m.group(2)
                items.append(self._inline(content))
                i += 1
            else:
                # Continuation line? Only if indented more than base
                if len(line) - len(line.lstrip()) > base_indent and items:
                    items[-1] += " " + self._inline(line.strip())
                    i += 1
                else:
                    break

        tag = "ol" if ordered else "ul"
        inner = "".join(f"<li>{item}</li>" for item in items)
        return f"<{tag}>{inner}</{tag}>", i

    def _detect_list_type(self, line):
        """Detect if a line starts an ordered list."""
        return bool(re.match(r"^\s*\d+\.\s+", line))

    def _parse_paragraph(self, lines, i):
        """Parse a paragraph of text."""
        para_lines = []
        while i < len(lines):
            line = lines[i]
            if line.strip() == "":
                i += 1
                break
            # Stop if we hit a block-level element
            if (line.strip().startswith("#") or
                line.strip().startswith("```") or
                line.strip().startswith(">") or
                re.match(r"^\s*([-*+])\s+", line) or
                re.match(r"^\s*\d+\.\s+", line) or
                ("|" in line and i + 1 < len(lines) and "|" in lines[i + 1])):
                break
            para_lines.append(line)
            i += 1

        content = self._inline(" ".join(para_lines))
        return f"<p>{content}</p>", i

    # -- Inline formatting --

    def _inline(self, text: str) -> str:
        """Process inline markdown formatting."""
        # Images: ![alt](src)
        text = re.sub(
            r"!\[([^\]]*)\]\(([^)]+)\)",
            r'<img src="\2" alt="\1">',
            text,
        )

        # Links: [text](url)
        text = re.sub(
            r"\[([^\]]+)\]\(([^)]+)\)",
            r'<a href="\2">\1</a>',
            text,
        )

        # Bold: **text** or __text__
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"__(.+?)__", r"<strong>\1</strong>", text)

        # Italic: *text* or _text_ (but not inside words with underscores)
        text = re.sub(r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", text)
        text = re.sub(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", r"<em>\1</em>", text)

        # Inline code: `code`
        text = re.sub(r"`([^`]+)`", lambda m: f"<code>{html.escape(m.group(1))}</code>", text)

        # Em dash: --
        text = text.replace(" -- ", " &mdash; ")

        # Arrow: ->
        text = text.replace(" -> ", " &rarr; ")
        text = re.sub(r"(?<=\s)->(?=\s)", "&rarr;", text)

        return text


# ---------------------------------------------------------------------------
# Slide Processing
# ---------------------------------------------------------------------------

def strip_yaml_frontmatter(text: str) -> str:
    """Remove YAML front matter (--- ... ---) from the beginning of text."""
    m = re.match(r"^---\s*\n(.*?\n)---\s*\n", text, re.DOTALL)
    if m:
        return text[m.end():]
    return text


def read_slide_files(slides_dir: Path, pattern: str) -> list:
    """Read all matching slide files in sorted order. Return list of (filename, content)."""
    files = sorted(slides_dir.glob(pattern))
    if not files:
        print(f"ERROR: No slide files matching '{pattern}' found in {slides_dir}")
        sys.exit(1)

    result = []
    for f in files:
        content = f.read_text(encoding="utf-8")
        result.append((f.name, content))
        print(f"  Read: {f.name} ({len(content)} bytes)")

    return result


def merge_and_split(slide_files: list) -> list:
    """
    Merge all slide file contents and split on --- separators.

    Returns list of (module_name, slide_texts) tuples where slide_texts
    is a list of raw markdown strings for each slide in that module.
    """
    modules = []

    for filename, content in slide_files:
        # Strip YAML front matter if present
        content = strip_yaml_frontmatter(content)
        # Split on --- (horizontal rule used as slide separator)
        slides = re.split(r"\n---\n", content)
        # Clean up each slide
        slides = [s.strip() for s in slides if s.strip()]
        module_name = filename.replace(".md", "")
        modules.append((module_name, slides))

    return modules


def classify_slide(md_text: str) -> str:
    """
    Classify a slide to help with section wrapping.

    Returns:
        'module-title' - starts with h1 (#)
        'content'      - regular content slide
    """
    first_line = md_text.strip().split("\n")[0].strip()
    if re.match(r"^#\s+", first_line) and not re.match(r"^##", first_line):
        return "module-title"
    return "content"


def build_slides_html(modules: list, converter: MarkdownConverter) -> str:
    """
    Convert all modules/slides to reveal.js HTML sections.

    Each slide becomes a <section>. Module title slides get a special class.
    """
    all_sections = []
    total_slides = 0

    for module_name, slides in modules:
        for slide_md in slides:
            slide_type = classify_slide(slide_md)
            slide_html = converter.convert(slide_md)

            css_class = ""
            if slide_type == "module-title":
                css_class = ' class="module-title"'

            section = f"            <section{css_class} data-module=\"{module_name}\">\n"
            section += f"                {slide_html}\n"
            section += "            </section>"
            all_sections.append(section)
            total_slides += 1

    return "\n\n".join(all_sections), total_slides


def build_presentation(template: str, slides_html: str) -> str:
    """Insert slides HTML into the template."""
    if "{{SLIDES_CONTENT}}" not in template:
        print("ERROR: Template does not contain {{SLIDES_CONTENT}} placeholder!")
        sys.exit(1)

    return template.replace("{{SLIDES_CONTENT}}", slides_html)


def build_presenter_version(presentation_html: str) -> str:
    """
    Create a presenter version with notes visible.

    Modifies the Reveal.initialize config to show notes.
    """
    return presentation_html.replace(
        "showNotes: false",
        "showNotes: true"
    )


def build_module_html(template: str, module_name: str, slides: list,
                       converter: MarkdownConverter) -> str:
    """Build a standalone HTML file for a single module."""
    sections = []
    for slide_md in slides:
        slide_type = classify_slide(slide_md)
        slide_html = converter.convert(slide_md)
        css_class = ' class="module-title"' if slide_type == "module-title" else ""
        section = f"            <section{css_class}>\n"
        section += f"                {slide_html}\n"
        section += "            </section>"
        sections.append(section)

    slides_html = "\n\n".join(sections)
    return build_presentation(template, slides_html)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Frida Course Presentation Builder")
    print("=" * 60)
    print()

    build_modules = "--modules" in sys.argv or "--all" in sys.argv
    build_presenter = "--presenter" in sys.argv or "--all" in sys.argv

    # Read template
    if not TEMPLATE_FILE.exists():
        print(f"ERROR: Template file not found: {TEMPLATE_FILE}")
        sys.exit(1)
    template = TEMPLATE_FILE.read_text(encoding="utf-8")
    print(f"Template: {TEMPLATE_FILE.name} ({len(template)} bytes)")
    print()

    # Read slide files
    print("Reading slide files:")
    slide_files = read_slide_files(SLIDES_DIR, SLIDE_GLOB)
    print(f"\n  Total files: {len(slide_files)}")
    print()

    # Parse and split
    print("Processing slides...")
    modules = merge_and_split(slide_files)

    total_slide_count = sum(len(slides) for _, slides in modules)
    print(f"  Modules: {len(modules)}")
    for mod_name, slides in modules:
        print(f"    {mod_name}: {len(slides)} slides")
    print(f"  Total slides: {total_slide_count}")
    print()

    # Convert to HTML
    print("Converting markdown to HTML...")
    converter = MarkdownConverter()
    slides_html, slide_count = build_slides_html(modules, converter)
    print(f"  Generated {slide_count} <section> elements")
    print()

    # Build main presentation
    print("Building presentation...")
    presentation = build_presentation(template, slides_html)
    OUTPUT_FILE.write_text(presentation, encoding="utf-8")
    size_kb = len(presentation.encode("utf-8")) / 1024
    print(f"  Output: {OUTPUT_FILE.name} ({size_kb:.1f} KB)")

    # Build presenter version
    if build_presenter:
        print("\nBuilding presenter version...")
        presenter = build_presenter_version(presentation)
        PRESENTER_FILE.write_text(presenter, encoding="utf-8")
        size_kb = len(presenter.encode("utf-8")) / 1024
        print(f"  Output: {PRESENTER_FILE.name} ({size_kb:.1f} KB)")

    # Build per-module files
    if build_modules:
        print("\nBuilding per-module files...")
        OUTPUT_DIR.mkdir(exist_ok=True)
        for mod_name, slides in modules:
            mod_html = build_module_html(template, mod_name, slides, converter)
            mod_file = OUTPUT_DIR / f"{mod_name}.html"
            mod_file.write_text(mod_html, encoding="utf-8")
            size_kb = len(mod_html.encode("utf-8")) / 1024
            print(f"  {mod_file.name} ({len(slides)} slides, {size_kb:.1f} KB)")

    # Summary
    print()
    print("=" * 60)
    print("  Build Complete!")
    print("=" * 60)
    print(f"""
  Modules:      {len(modules)}
  Total slides: {total_slide_count}
  Main output:  {OUTPUT_FILE}""")
    if build_presenter:
        print(f"  Presenter:    {PRESENTER_FILE}")
    if build_modules:
        print(f"  Module dir:   {OUTPUT_DIR}/")
    print(f"""
  Open in your browser:
    firefox {OUTPUT_FILE}
    google-chrome {OUTPUT_FILE}

  Keyboard shortcuts:
    Arrow keys    Navigate slides
    Esc           Overview mode
    S             Speaker notes
    F             Fullscreen
    B / .         Pause (black screen)
    Ctrl+Shift+F  Search slides
""")


if __name__ == "__main__":
    main()
