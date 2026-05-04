# -*- coding: utf-8 -*-
import time
from flask import Flask, jsonify, send_from_directory, request
from config import CACHE_TTL
from fetchers import BilibiliFetcher, WeiboFetcher, DouyinFetcher
from filter_ai import annotate_items

app = Flask(__name__, static_folder="static", static_url_path="")

# ── 缓存 ─────────────────────────────────────────
_cache = {}

# ── Fetcher 实例 ─────────────────────────────────
_fetchers = {
    "bilibili": BilibiliFetcher(),
    "weibo": WeiboFetcher(),
    "douyin": DouyinFetcher(),
}


def _get_platform_data(name):
    """获取单个平台数据，优先使用缓存"""
    now = time.time()
    cached = _cache.get(name)
    if cached and (now - cached["ts"]) < CACHE_TTL:
        return cached["data"]

    fetcher = _fetchers[name]
    data = fetcher.fetch()

    # 失败时返回旧缓存 (stale)
    if data["status"] not in ("ok", "unavailable"):
        if cached:
            data["status"] = "stale"
            data["stale_seconds"] = int(now - cached["ts"])
            return cached["data"]

    _cache[name] = {"ts": now, "data": data}
    return data


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/trends")
def api_trends():
    result = {"updated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "platforms": {}}
    ai_total = 0
    all_total = 0

    for name in ("bilibili", "weibo", "douyin"):
        data = _get_platform_data(name)
        # 为每个条目标注AI匹配
        annotate_items(data.get("items", []))
        result["platforms"][name] = data
        all_total += len(data.get("items", []))
        ai_total += sum(1 for it in data.get("items", []) if it["ai_match"]["matched"])

    result["ai_filtered_count"] = ai_total
    result["total_count"] = all_total
    return jsonify(result)


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    _cache.clear()
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("\n🔥 AI趋势热榜 已启动 → http://localhost:5000\n")
    app.run(debug=False, host="127.0.0.1", port=5000)
