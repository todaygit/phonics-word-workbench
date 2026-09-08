from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def load_blocks(path: Path) -> list[dict[str, object]]:
    return json.loads(path.read_text(encoding="utf-8"))["blocks"]


def collect(blocks: list[dict[str, object]]):
    chapters: list[dict[str, object]] = []
    rows: list[dict[str, object]] = []
    heading = ""
    rule = ""
    child_note = ""

    for block in blocks:
        if block["type"] == "paragraph":
            text = str(block["text"])
            if block.get("style") == "Heading 1":
                heading = text
                rule = ""
                child_note = ""
            elif text == "一、本课规则":
                rule = "__NEXT__"
            elif rule == "__NEXT__":
                rule = text
            elif text == "二、给孩子的讲法":
                child_note = "__NEXT__"
            elif child_note == "__NEXT__":
                child_note = text
            continue

        table_rows = block.get("rows", [])
        if not table_rows or len(table_rows[0]) < 6 or table_rows[0][2] != "单词":
            continue

        chapter_order = len(chapters) + 1
        number_match = re.match(r"(\d+\.\d+)", heading)
        chapter_id = number_match.group(1) if number_match else f"chapter-{chapter_order}"
        chapters.append(
            {
                "id": chapter_id,
                "order": chapter_order,
                "title": heading,
                "rule": rule,
                "childNote": child_note,
                "wordCount": len(table_rows) - 1,
            }
        )
        for word_order, source_row in enumerate(table_rows[1:], start=1):
            source_row = list(source_row) + [""] * (6 - len(source_row))
            rows.append(
                {
                    "id": f"v08-{chapter_id.replace('.', '-')}-{word_order:03d}",
                    "chapterId": chapter_id,
                    "chapterOrder": chapter_order,
                    "wordOrder": word_order,
                    "level": source_row[1],
                    "word": source_row[2].strip(),
                    "ipa": source_row[3].strip(),
                    "phonics": source_row[4].strip(),
                    "meaning": "",
                    "example": source_row[5].strip(),
                }
            )

    return chapters, rows


def translate_word(word: str) -> str:
    query = urllib.parse.urlencode(
        {"client": "gtx", "sl": "en", "tl": "zh-CN", "dt": "t", "q": word}
    )
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            translated = "".join(part[0] for part in payload[0] if part and part[0]).strip()
            if translated:
                return translated
        except Exception as error:  # pragma: no cover - network retry path
            last_error = error
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Unable to translate {word!r}: {last_error}")


def build_translations(words: list[str], cache_path: Path, workers: int) -> dict[str, str]:
    translations: dict[str, str] = {}
    if cache_path.exists():
        translations.update(json.loads(cache_path.read_text(encoding="utf-8")))

    pending = [word for word in sorted(set(words)) if word not in translations]
    if not pending:
        return translations

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(translate_word, word): word for word in pending}
        for index, future in enumerate(as_completed(futures), start=1):
            word = futures[future]
            translations[word] = future.result()
            if index % 25 == 0 or index == len(pending):
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(
                    json.dumps(translations, ensure_ascii=False, indent=2, sort_keys=True),
                    encoding="utf-8",
                )
                print(f"translated {index}/{len(pending)}")
    return translations


def load_translations(path: Path) -> dict[str, str]:
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    translations: dict[str, str] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "|" not in line:
            raise ValueError(f"Invalid translation row at line {line_number}: {line}")
        word, meaning = line.split("|", 1)
        translations[word.strip().lower()] = meaning.strip()
    return translations


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("extract", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--translations", type=Path, required=True)
    parser.add_argument("--translate", action="store_true")
    parser.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    chapters, words = collect(load_blocks(args.extract))
    translations = (
        build_translations([str(item["word"]).lower() for item in words], args.translations, args.workers)
        if args.translate
        else load_translations(args.translations)
    )
    for item in words:
        item["meaning"] = translations.get(str(item["word"]).lower(), "待补充")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "version": "v0.8",
                "sourceTitle": "自然拼读背单词小手册·拼写导向版 v0.8",
                "chapters": chapters,
                "words": words,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {len(chapters)} chapters and {len(words)} words to {args.output}")


if __name__ == "__main__":
    main()
