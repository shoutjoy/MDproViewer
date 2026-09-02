"""Small, dependency-free web search used by the local MD Viewer server."""

from html import unescape
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


SEARCH_PATHS = {"/api/web-search", "/api/web-search/"}
_TAG_RE = re.compile(r"<[^>]+>")


def normalize_request(query_string):
    values = urllib.parse.parse_qs(query_string or "", keep_blank_values=True)
    query = str((values.get("q") or [""])[0]).strip()[:500]
    if not query:
        raise ValueError("인터넷 검색어를 입력하세요.")
    try:
        count = int((values.get("count") or ["10"])[0])
    except (TypeError, ValueError):
        count = 10
    count = max(1, min(50, count))
    mode = "reasoning" if (values.get("mode") or ["quick"])[0] == "reasoning" else "quick"
    return query, count, mode


def _plain_text(value):
    return re.sub(r"\s+", " ", unescape(_TAG_RE.sub(" ", value or ""))).strip()


def _source_name(url):
    try:
        return urllib.parse.urlsplit(url).hostname or "Web"
    except ValueError:
        return "Web"


def search_bing_rss(query, count, timeout=12):
    params = urllib.parse.urlencode({"q": query, "format": "rss", "count": count})
    request = urllib.request.Request(
        "https://www.bing.com/search?" + params,
        headers={"User-Agent": "Mozilla/5.0 MDViewer/1.0", "Accept": "application/rss+xml, application/xml"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read(2 * 1024 * 1024)
    root = ET.fromstring(payload)
    results = []
    seen = set()
    for item in root.findall(".//item"):
        url = str(item.findtext("link") or "").strip()
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            continue
        clean_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))
        if clean_url in seen:
            continue
        seen.add(clean_url)
        results.append({
            "title": _plain_text(item.findtext("title")) or "제목 없음",
            "url": clean_url,
            "snippet": _plain_text(item.findtext("description")),
            "date": _plain_text(item.findtext("pubDate")),
            "source": _source_name(clean_url),
            "kind": "text",
            "engine": "bing-rss",
            "channel": "general",
        })
        if len(results) >= count:
            break
    return results


def web_search(query_string):
    query, count, mode = normalize_request(query_string)
    results = search_bing_rss(query, count, timeout=20 if mode == "reasoning" else 12)
    if not results:
        raise LookupError("검증 가능한 인터넷 검색 결과가 없습니다.")
    return {"ok": True, "query": query, "mode": mode, "engine": "bing-rss", "results": results, "warnings": []}
