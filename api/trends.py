# -*- coding: utf-8 -*-
"""Vercel Serverless Function — unified API proxy for B站/微博/抖音 trends."""

import json
import re
import time
from urllib.parse import unquote
from flask import Flask, jsonify, request

app = Flask(__name__)

# ═══════════════════════════════════════════
# AI Keywords
# ═══════════════════════════════════════════
AI_TIER1 = [
    "AI", "人工智能", "大模型", "LLM", "GPT", "ChatGPT", "Claude",
    "DeepSeek", "深度学习", "机器学习", "神经网络", "Transformer",
    "Stable Diffusion", "Midjourney", "Sora", "生成式AI", "AGI",
    "AIGC", "智能体", "Agent", "Copilot", "Gemini", "文心一言",
    "通义千问", "豆包", "混元", "百川", "Kimi", "元宝",
    "Grok", "Llama", "Qwen", "OpenAI", "Anthropic", "智谱",
    "ChatGLM", "强化学习", "多模态", "文生图", "文生视频",
    "Manus", "MCP",
]

AI_TIER2 = [
    "模型", "训练", "推理", "数据集", "算力", "GPU", "NPU", "TPU",
    "提示词", "Prompt", "ChatBot", "机器人", "自动驾驶", "语音识别",
    "视觉", "NLP", "RAG", "向量", "embedding", "微调",
    "预训练", "开源模型", "国产芯片", "昇腾", "寒武纪",
    "CUDA", "Tensor", "PyTorch", "JAX", "HuggingFace",
    "LangChain", "Dify", "Coze", "扣子", "数字人", "具身智能",
    "无人驾驶", "智能驾驶", "AI绘画", "AI视频",
]

# ═══════════════════════════════════════════
# HTTP helpers
# ═══════════════════════════════════════════
import requests as req

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
TIMEOUT = 10


def http_get(url, headers=None):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    try:
        r = req.get(url, headers=h, timeout=TIMEOUT)
        if r.status_code == 200:
            return r
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════
# Platform fetchers
# ═══════════════════════════════════════════

def fetch_bilibili():
    r = http_get("https://s.search.bilibili.com/main/hotword")
    if not r:
        return None
    try:
        data = r.json()
    except Exception:
        return None
    items = []
    for item in (data.get("list") or []):
        kw = item.get("keyword", "")
        items.append({
            "rank": item.get("pos", len(items) + 1),
            "keyword": kw,
            "show_name": item.get("show_name", kw),
            "heat_score": item.get("heat_score", 0),
            "label": item.get("heat_layer", ""),
            "url": "https://search.bilibili.com/all?keyword=" + kw,
        })
    return items


def fetch_weibo():
    """Try TopHub for Weibo hot search data."""
    r = http_get("https://tophub.today/n/KqndgxeLl9",
                 headers={"Referer": "https://tophub.today/"})
    if not r:
        return None
    return _parse_tophub(r.text, "https://s.weibo.com/weibo?q=")


def fetch_douyin():
    """Try TopHub for Douyin hot search data."""
    r = http_get("https://tophub.today/n/DpQvNABoNE",
                 headers={"Referer": "https://tophub.today/"})
    if not r:
        return None
    items = _parse_tophub_douyin(r.text)
    for item in items:
        item["url"] = "https://www.douyin.com/search/" + item["keyword"]
    return items


def _parse_tophub(html, search_prefix):
    items = []
    pat = r'<tr[^>]*>\s*<td[^>]*>(\d+)\.?</td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)</a>\s*</td>\s*<td[^>]*>([^<]*)</td>'
    for m in re.finditer(pat, html):
        items.append({
            "rank": int(m.group(1)),
            "keyword": m.group(3).strip(),
            "show_name": m.group(3).strip(),
            "heat_score": 0,
            "heat_str": m.group(4).strip(),
            "label": "",
            "url": m.group(2) or (search_prefix + m.group(3).strip()),
        })
    return items


def _parse_tophub_douyin(html):
    items = []
    pat = r'<tr[^>]*>\s*<td[^>]*>(\d+)\.?</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>\s*<div>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)</a>'
    for m in re.finditer(pat, html):
        title = re.sub(r'[\r\n\t]+', ' ', m.group(3)).strip()
        title = re.sub(r'\s{2,}', ' ', title)
        items.append({
            "rank": int(m.group(1)),
            "keyword": title,
            "show_name": title,
            "heat_score": 0,
            "heat_str": "",
            "label": "",
            "url": m.group(2),
        })
    if not items:
        items = _parse_tophub(html, "")
    return items


# ═══════════════════════════════════════════
# AI matching
# ═══════════════════════════════════════════
def match_ai(item):
    text = (item.get("keyword", "") + " " + item.get("show_name", "")).lower()
    for kw in AI_TIER1:
        if kw.lower() in text:
            return {"matched": True, "tier": 1, "keyword": kw}
    for kw in AI_TIER2:
        if kw.lower() in text:
            return {"matched": True, "tier": 2, "keyword": kw}
    return {"matched": False, "tier": 0, "keyword": ""}


# ═══════════════════════════════════════════
# Cache (in-memory, per-function-instance)
# ═══════════════════════════════════════════
_cache = {}
CACHE_TTL = 90  # seconds — shorter than frontend TTL


def cached_fetch(name, fetcher):
    now = time.time()
    entry = _cache.get(name)
    if entry and (now - entry["ts"]) < CACHE_TTL:
        return entry["data"]
    data = fetcher()
    _cache[name] = {"ts": now, "data": data}
    return data


# ═══════════════════════════════════════════
# API endpoint
# ═══════════════════════════════════════════
@app.route("/api/trends")
def api_trends():
    platforms = {}

    for name, fetcher in [("bilibili", fetch_bilibili),
                           ("weibo", fetch_weibo),
                           ("douyin", fetch_douyin)]:
        items = cached_fetch(name, fetcher)
        if items is None:
            platforms[name] = {"status": "error", "items": [], "error": "数据源不可用"}
        else:
            for item in items:
                item["ai_match"] = match_ai(item)
            platforms[name] = {"status": "ok", "items": items, "error": ""}

    ai_total = sum(
        sum(1 for it in p["items"] if it["ai_match"]["matched"])
        for p in platforms.values()
    )
    total = sum(len(p["items"]) for p in platforms.values())

    resp = jsonify({
        "updated_at": time.strftime("%H:%M:%S"),
        "platforms": platforms,
        "ai_filtered_count": ai_total,
        "total_count": total,
    })
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    _cache.clear()
    resp = jsonify({"ok": True})
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# Vercel entry point
def handler(environ, start_response):
    return app(environ, start_response)
