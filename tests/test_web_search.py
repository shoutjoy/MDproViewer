import unittest
from unittest import mock

import web_search


RSS = b"""<?xml version="1.0" encoding="utf-8"?>
<rss><channel>
  <item><title>First &amp; result</title><link>https://example.com/a</link><description><![CDATA[<b>Useful</b> summary]]></description></item>
  <item><title>Duplicate</title><link>https://example.com/a</link><description>duplicate</description></item>
  <item><title>Second</title><link>https://example.org/b#section</link><description>More</description></item>
</channel></rss>"""


class Response:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def read(self, _limit):
        return RSS


class WebSearchTests(unittest.TestCase):
    def test_request_is_validated_and_normalized(self):
        self.assertEqual(web_search.normalize_request("q=hello&count=999&mode=bad"), ("hello", 50, "quick"))
        with self.assertRaises(ValueError):
            web_search.normalize_request("q=%20")

    @mock.patch("web_search.urllib.request.urlopen", return_value=Response())
    def test_bing_rss_is_normalized_and_deduplicated(self, _open):
        results = web_search.search_bing_rss("test", 10)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["title"], "First & result")
        self.assertEqual(results[0]["snippet"], "Useful summary")
        self.assertEqual(results[1]["url"], "https://example.org/b")
        self.assertEqual(results[0]["engine"], "bing-rss")


if __name__ == "__main__":
    unittest.main()
