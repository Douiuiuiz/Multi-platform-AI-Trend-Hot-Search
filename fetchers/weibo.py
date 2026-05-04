# -*- coding: utf-8 -*-
import re
import json
from .base import BaseFetcher
from config import WEIBO_HOTSEARCH_URL, WEIBO_SEARCH_URL


class WeiboFetcher(BaseFetcher):
    name = "weibo"

    def fetch(self):
        headers = {
            "Referer": "https://weibo.com/",
            "Accept": "application/json, text/plain, */*",
        }
        resp = self._get(WEIBO_HOTSEARCH_URL, headers=headers)
        if resp is None:
            return self._fallback()

        try:
            data = resp.json()
        except ValueError:
            return self._fallback()

        raw_list = (data.get("data") or {}).get("realtime") or []
        if not raw_list:
            return self._fallback()

        items = []
        for i, item in enumerate(raw_list[:50]):
            word = item.get("word", "")
            items.append({
                "rank": i + 1,
                "keyword": word,
                "heat_score": item.get("raw_hot", 0),
                "category": item.get("category", ""),
                "label": item.get("label_name", ""),
                "url": WEIBO_SEARCH_URL.format(keyword=word),
            })

        return self.build_result("ok", items)

    def _fallback(self):
        """回退方案：抓取 weibo.com/hot 页面解析内嵌数据"""
        headers = {"Referer": "https://weibo.com/"}
        resp = self._get("https://weibo.com/hot", headers=headers)
        if resp is None:
            return self.build_result("error", [], "网络请求失败")

        html = resp.text
        items = []
        # 尝试从页面中提取热搜数据
        # 微博页面通常有 <script> 包含初始数据
        pattern = r'"word"\s*:\s*"([^"]+)".*?"raw_hot"\s*:\s*(\d+)'
        matches = re.findall(pattern, html)

        for i, (word, raw_hot) in enumerate(matches[:50]):
            items.append({
                "rank": i + 1,
                "keyword": word,
                "heat_score": int(raw_hot),
                "category": "",
                "label": "",
                "url": WEIBO_SEARCH_URL.format(keyword=word),
            })

        if items:
            return self.build_result("ok", items)

        # 二次回退：尝试提取更宽泛的 pattern
        pattern2 = r'"word"\s*:\s*"([^"]+)"'
        matches2 = re.findall(pattern2, html)
        for i, word in enumerate(matches2[:50]):
            items.append({
                "rank": i + 1,
                "keyword": word,
                "heat_score": 0,
                "category": "",
                "label": "",
                "url": WEIBO_SEARCH_URL.format(keyword=word),
            })

        if items:
            return self.build_result("ok", items)

        return self.build_result("unavailable", [], "无法获取微博热搜数据")
