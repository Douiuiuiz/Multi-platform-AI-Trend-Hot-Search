# -*- coding: utf-8 -*-
import re
import json
from .base import BaseFetcher
from config import DOUYIN_HOT_URL, DOUYIN_TOPHUB_URL, DOUYIN_SEARCH_URL


class DouyinFetcher(BaseFetcher):
    name = "douyin"

    def fetch(self):
        # 策略1: 直接抓取抖音热榜页面
        result = self._fetch_douyin_hot()
        if result["status"] == "ok" and result["items"]:
            return result

        # 策略2: tophub.today 作为回退
        result = self._fetch_tophub()
        if result["status"] == "ok" and result["items"]:
            return result

        # 策略3: 不可用
        return self.build_result("unavailable", [], "抖音热搜暂不可用")

    def _fetch_douyin_hot(self):
        """策略1: 抓取 douyin.com/hot 页面，解析 RENDER_DATA 内嵌JSON"""
        headers = {
            "Referer": "https://www.douyin.com/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        resp = self._get(DOUYIN_HOT_URL, headers=headers)
        if resp is None:
            return self.build_result("error", [])

        html = resp.text

        # 尝试提取 <script id="RENDER_DATA" type="application/json">
        match = re.search(
            r'<script[^>]+id="RENDER_DATA"[^>]*>(.*?)</script>',
            html, re.DOTALL
        )
        if match:
            try:
                raw = match.group(1)
                # URL-decode
                from urllib.parse import unquote
                decoded = unquote(raw)
                data = json.loads(decoded)
                items = self._parse_douyin_data(data)
                if items:
                    return self.build_result("ok", items)
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

        # 尝试从页面中直接提取热搜词
        items = self._parse_douyin_html(html)
        if items:
            return self.build_result("ok", items)

        return self.build_result("error", [])

    def _parse_douyin_data(self, data):
        """解析抖音 RENDER_DATA 中的热搜数据"""
        items = []
        try:
            # 尝试多种可能的JSON路径
            hot_list = None
            app_data = data.get("app", data)

            # 路径: app.hotSearchData or hotSearchData or data.hot_list
            if isinstance(app_data, dict):
                hot_list = (
                    app_data.get("hotSearchData")
                    or app_data.get("hot_list")
                    or app_data.get("hot_search_list")
                )

            if isinstance(hot_list, str):
                hot_list = json.loads(hot_list)

            if isinstance(hot_list, list):
                for i, item in enumerate(hot_list[:50]):
                    if isinstance(item, dict):
                        word = item.get("word") or item.get("title") or item.get("name") or ""
                        items.append({
                            "rank": item.get("position", i + 1),
                            "keyword": word,
                            "heat_score": item.get("hot_value") or item.get("heat") or 0,
                            "label": item.get("label_name") or "",
                            "url": DOUYIN_SEARCH_URL.format(keyword=word),
                        })
        except (AttributeError, TypeError, json.JSONDecodeError):
            pass
        return items

    def _parse_douyin_html(self, html):
        """从HTML中提取热搜数据"""
        items = []
        # 匹配热点词
        patterns = [
            r'"word"\s*:\s*"([^"]+)"[^}]*?"hot_value"\s*:\s*(\d+)',
            r'"title"\s*:\s*"([^"]+)"[^}]*?"hot_value"\s*:\s*(\d+)',
        ]
        seen = set()
        for pattern in patterns:
            matches = re.findall(pattern, html)
            for word, hot_val in matches:
                word = word.strip()
                if word and word not in seen:
                    seen.add(word)
                    items.append({
                        "rank": len(items) + 1,
                        "keyword": word,
                        "heat_score": int(hot_val) if hot_val.isdigit() else 0,
                        "label": "",
                        "url": DOUYIN_SEARCH_URL.format(keyword=word),
                    })
            if items:
                break
        return items

    def _fetch_tophub(self):
        """策略2: 从 tophub.today 获取抖音热搜"""
        headers = {
            "Referer": "https://tophub.today/",
            "Accept": "text/html,application/xhtml+xml,*/*",
        }
        resp = self._get(DOUYIN_TOPHUB_URL, headers=headers)
        if resp is None:
            return self.build_result("error", [])

        html = resp.text
        items = []
        # tophub 表格: <tr> 中包含排名和关键词
        # 匹配模式: <td>排名</td>...<a ...>关键词</a>...<td>热度</td>
        row_pattern = re.compile(
            r'<tr[^>]*>.*?<td[^>]*>(\d+)</td>.*?<a[^>]*>([^<]+)</a>.*?<td[^>]*>([^<]*)</td>',
            re.DOTALL
        )
        matches = row_pattern.findall(html)
        for match in matches[:50]:
            rank, keyword, heat = match
            keyword = keyword.strip()
            if keyword:
                items.append({
                    "rank": int(rank),
                    "keyword": keyword,
                    "heat_score": 0,
                    "heat_str": heat.strip(),
                    "label": "",
                    "url": DOUYIN_SEARCH_URL.format(keyword=keyword),
                })

        if items:
            return self.build_result("ok", items)

        return self.build_result("error", [])
