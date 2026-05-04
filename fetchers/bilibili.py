# -*- coding: utf-8 -*-
from .base import BaseFetcher
from config import BILIBILI_HOTWORD_URL, BILIBILI_SEARCH_URL


class BilibiliFetcher(BaseFetcher):
    name = "bilibili"

    def fetch(self):
        resp = self._get(BILIBILI_HOTWORD_URL)
        if resp is None:
            return self.build_result("error", [], "网络请求失败")

        try:
            data = resp.json()
        except ValueError:
            return self.build_result("error", [], "JSON 解析失败")

        if data.get("code") != 0:
            return self.build_result("error", [], f'API 返回错误: code={data.get("code")}')

        raw_list = data.get("list") or []
        items = []
        for item in raw_list:
            keyword = item.get("keyword", "")
            items.append({
                "rank": item.get("pos", 0),
                "keyword": keyword,
                "show_name": item.get("show_name", keyword),
                "heat_score": item.get("heat_score", 0),
                "heat_layer": item.get("heat_layer", ""),
                "icon": item.get("icon", ""),
                "url": BILIBILI_SEARCH_URL.format(keyword=keyword),
            })

        return self.build_result("ok", items)
