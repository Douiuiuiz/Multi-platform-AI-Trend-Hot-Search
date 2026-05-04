# -*- coding: utf-8 -*-
from config import AI_KEYWORDS_TIER1, AI_KEYWORDS_TIER2


def match_ai(item):
    """对单个热点条目进行AI关键词匹配，返回匹配信息"""
    text = item.get("keyword", "") + " " + item.get("show_name", "")
    text_lower = text.lower()

    for kw in AI_KEYWORDS_TIER1:
        if kw.lower() in text_lower:
            return {"matched": True, "tier": 1, "keyword": kw}

    for kw in AI_KEYWORDS_TIER2:
        if kw.lower() in text_lower:
            return {"matched": True, "tier": 2, "keyword": kw}

    return {"matched": False, "tier": 0, "keyword": ""}


def annotate_items(items):
    """对条目列表逐一标注 AI 匹配信息"""
    for item in items:
        item["ai_match"] = match_ai(item)
    return items


def filter_items(items, ai_only=False):
    """可选筛出仅AI相关的条目"""
    if not ai_only:
        return items
    return [it for it in items if it["ai_match"]["matched"]]
