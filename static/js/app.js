(function () {
  "use strict";

  // ═══════════════════════════════════════════
  // Config
  // ═══════════════════════════════════════════
  var CACHE_TTL = 120;
  var REFRESH_INTERVAL = 120;
  var REQUEST_TIMEOUT = 10000;
  var CORS_PROXIES = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="];

  var AI_TIER1 = [
    "AI", "人工智能", "大模型", "LLM", "GPT", "ChatGPT", "Claude",
    "DeepSeek", "深度学习", "机器学习", "神经网络", "Transformer",
    "Stable Diffusion", "Midjourney", "Sora", "生成式AI", "AGI",
    "AIGC", "智能体", "Agent", "Copilot", "Gemini", "文心一言",
    "通义千问", "豆包", "混元", "百川", "Kimi", "元宝",
    "Grok", "Llama", "Qwen", "OpenAI", "Anthropic", "智谱",
    "ChatGLM", "强化学习", "多模态", "文生图", "文生视频",
    "Manus", "MCP",
  ];
  var AI_TIER2 = [
    "模型", "训练", "推理", "数据集", "算力", "GPU", "NPU", "TPU",
    "提示词", "Prompt", "ChatBot", "机器人", "自动驾驶", "语音识别",
    "视觉", "NLP", "RAG", "向量", "embedding", "微调",
    "预训练", "开源模型", "国产芯片", "昇腾", "寒武纪",
    "CUDA", "Tensor", "PyTorch", "JAX", "HuggingFace",
    "LangChain", "Dify", "Coze", "扣子", "数字人", "具身智能",
    "无人驾驶", "智能驾驶", "AI绘画", "AI视频",
  ];

  // Platform definitions (reuses data sources from original fetchers)
  // Sources format: { name, url, type: 'json'|'html', proxy: bool, parse: fn }
  var PLATFORMS = {
    bilibili: {
      name: "bilibili",
      label: "B站热搜",
      iconClass: "bili",
      symbol: "B",
      searchUrl: function (kw) { return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(kw); },
      sources: [
        {
          name: "B站官方",
          url: "https://s.search.bilibili.com/main/hotword",
          type: "json",
          parse: function (data) {
            return (data.list || []).map(function (item, i) {
              return {
                rank: item.pos || i + 1,
                keyword: item.keyword || "",
                show_name: item.show_name || item.keyword || "",
                heat_score: item.heat_score || 0,
                label: item.heat_layer || "",
              };
            });
          },
        },
      ],
    },
    weibo: {
      name: "weibo",
      label: "微博热搜",
      iconClass: "weibo",
      symbol: "微",
      searchUrl: function (kw) { return "https://s.weibo.com/weibo?q=" + encodeURIComponent(kw); },
      sources: [
        {
          name: "DailyHotApi",
          url: "https://api-hot.imsyy.top/weibo?cache=true",
          type: "json",
          parse: function (data) {
            return (data.data || []).map(function (item, i) {
              return {
                rank: i + 1,
                keyword: item.title || item.name || "",
                show_name: item.title || item.name || "",
                heat_score: item.hot || 0,
                label: "",
                url: item.url || "",
              };
            });
          },
        },
        {
          name: "TopHub",
          url: "https://tophub.today/n/KqndgxeLl9",
          type: "html",
          proxy: true,
          parse: parseTopHub,
        },
      ],
    },
    douyin: {
      name: "douyin",
      label: "抖音趋势",
      iconClass: "douyin",
      symbol: "抖",
      searchUrl: function (kw) { return "https://www.douyin.com/search/" + encodeURIComponent(kw); },
      sources: [
        {
          name: "DailyHotApi",
          url: "https://api-hot.imsyy.top/douyin?cache=true",
          type: "json",
          parse: function (data) {
            return (data.data || []).map(function (item, i) {
              return {
                rank: i + 1,
                keyword: item.title || item.name || "",
                show_name: item.title || item.name || "",
                heat_score: item.hot || 0,
                label: "",
                url: item.url || "",
              };
            });
          },
        },
        {
          name: "TopHub",
          url: "https://tophub.today/n/DpQvNABoNE",
          type: "html",
          proxy: true,
          parse: parseTopHubDouyin,
        },
      ],
    },
  };

  // ═══════════════════════════════════════════
  // Parsers
  // ═══════════════════════════════════════════
  function parseTopHub(html) {
    var items = [];
    var re = /<tr[^>]*>\s*<td[^>]*>(\d+)\.?<\/td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      items.push({ rank: parseInt(m[1]) || items.length + 1, keyword: m[3].trim(), show_name: m[3].trim(), heat_score: 0, heat_str: m[4].trim(), label: "", url: m[2] || "#" });
    }
    return items;
  }

  function parseTopHubDouyin(html) {
    var items = [];
    var re = /<tr[^>]*>\s*<td[^>]*>(\d+)\.?<\/td>\s*<td[^>]*>.*?<\/td>\s*<td[^>]*>\s*<div>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var title = m[3].replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
      items.push({ rank: parseInt(m[1]) || items.length + 1, keyword: title, show_name: title, heat_score: 0, heat_str: "", label: "", url: m[2] || "#" });
    }
    if (items.length === 0) items = parseTopHub(html);
    return items;
  }

  // ═══════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════
  var state = {
    data: null,
    filterMode: "ai",    // "ai" | "all" | "tier1"
    searchTerm: "",
    activeTab: null,     // null = all, or "bilibili"|"weibo"|"douyin"
    autoRefresh: true,
    countdown: REFRESH_INTERVAL,
    timerId: null,
    sources: {},         // { platform: sourceName }
  };

  // ═══════════════════════════════════════════
  // Utils
  // ═══════════════════════════════════════════
  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }

  function escHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function fmtHeat(n) {
    if (!n || n === 0) return "";
    if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
    if (n >= 10000) return (n / 10000).toFixed(0) + "万";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function matchAI(item) {
    var text = (item.keyword + " " + (item.show_name || "")).toLowerCase();
    for (var i = 0; i < AI_TIER1.length; i++) {
      if (text.indexOf(AI_TIER1[i].toLowerCase()) !== -1) return { matched: true, tier: 1, keyword: AI_TIER1[i] };
    }
    for (var j = 0; j < AI_TIER2.length; j++) {
      if (text.indexOf(AI_TIER2[j].toLowerCase()) !== -1) return { matched: true, tier: 2, keyword: AI_TIER2[j] };
    }
    return { matched: false, tier: 0, keyword: "" };
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // ═══════════════════════════════════════════
  // Cache
  // ═══════════════════════════════════════════
  function cacheGet(k) {
    try {
      var r = sessionStorage.getItem("trends2_" + k);
      if (!r) return null;
      var e = JSON.parse(r);
      if (Date.now() - e.ts > CACHE_TTL * 1000) { sessionStorage.removeItem("trends2_" + k); return null; }
      return e.data;
    } catch (x) { return null; }
  }
  function cacheSet(k, d) {
    try { sessionStorage.setItem("trends2_" + k, JSON.stringify({ ts: Date.now(), data: d })); } catch (x) {}
  }
  function cacheClearAll() {
    ["bilibili", "weibo", "douyin"].forEach(function (k) { sessionStorage.removeItem("trends2_" + k); });
  }

  // ═══════════════════════════════════════════
  // Data fetching (same robust logic as v1)
  // ═══════════════════════════════════════════
  function fetchUrl(url, timeout) {
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, timeout || REQUEST_TIMEOUT);
      fetch(url, { signal: ctrl.signal }).then(function (r) {
        clearTimeout(t);
        if (!r.ok) return reject(new Error("HTTP " + r.status));
        resolve(r);
      }).catch(function (e) { clearTimeout(t); reject(e); });
    });
  }

  function fetchWithProxy(url, idx) {
    if (idx === undefined) idx = 0;
    if (idx >= CORS_PROXIES.length) return Promise.reject(new Error("All proxies exhausted"));
    return fetchUrl(CORS_PROXIES[idx] + encodeURIComponent(url)).catch(function () {
      return fetchWithProxy(url, idx + 1);
    });
  }

  function fetchSource(source) {
    function direct() {
      return fetchUrl(source.url).then(function (r) {
        return source.type === "json" ? r.json() : r.text();
      });
    }
    function viaProxy() {
      return fetchWithProxy(source.url).then(function (r) {
        return source.type === "json" ? r.json() : r.text();
      });
    }
    if (source.proxy) return viaProxy().catch(function () { return direct(); });
    return direct().catch(function () { return viaProxy(); });
  }

  function fetchPlatform(name) {
    var p = PLATFORMS[name];
    if (!p) return Promise.resolve({ status: "error", items: [], error: "Unknown" });
    var sources = p.sources.slice();
    var idx = 0;

    function tryNext(lastError) {
      if (idx >= sources.length) {
        var stale = cacheGet(name);
        if (stale && stale.length > 0) return Promise.resolve({ status: "stale", items: stale });
        console.warn("[" + name + "] 所有数据源失败: " + (lastError || "未知错误"));
        return Promise.resolve({ status: "error", items: [], error: "所有数据源不可用" });
      }
      var src = sources[idx];
      console.log("[" + name + "] 尝试数据源 #" + (idx + 1) + ": " + src.name + " (" + src.url.substring(0, 50) + "…)");
      return fetchSource(src).then(function (raw) {
        var items = src.parse(raw);
        console.log("[" + name + "] " + src.name + " 解析完成: " + items.length + " 条");
        if (!items || items.length === 0) { idx++; return tryNext("解析结果为空"); }
        items.forEach(function (it) { if (!it.url) it.url = p.searchUrl(it.keyword); });
        return { status: "ok", items: items, source: src.name };
      }).catch(function (err) {
        console.warn("[" + name + "] " + src.name + " 失败: " + (err && err.message || err));
        idx++;
        return tryNext(err && err.message);
      });
    }
    return tryNext();
  }

  // ═══════════════════════════════════════════
  // Main data loading
  // ═══════════════════════════════════════════

  // Mode 1: Unified API (Vercel deployment) — no CORS proxy needed
  function loadFromAPI() {
    return fetch("/api/trends", { signal: AbortSignal.timeout(15000) })
      .then(function (r) {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
      .then(function (data) {
        // Annotate AI matches (backend already does this, but double-check)
        ["bilibili", "weibo", "douyin"].forEach(function (name) {
          var p = data.platforms && data.platforms[name];
          if (p && p.items) {
            p.items.forEach(function (it) {
              if (!it.ai_match) it.ai_match = matchAI(it);
            });
            state.sources[name] = "API";
            // Cache individual platform data
            if (p.status === "ok" && p.items.length > 0) cacheSet(name, p.items);
          }
        });
        console.log("数据来源: API统一接口");
        return data;
      });
  }

  // Mode 2: Direct fetch + CORS proxy (local file:// or no backend)
  function loadAllData() {
    var names = ["bilibili", "weibo", "douyin"];
    return Promise.all(names.map(function (name) {
      var cached = cacheGet(name);
      if (cached && cached.length > 0) {
        return Promise.resolve({ status: "ok", items: cached, source: "缓存" });
      }
      return fetchPlatform(name).then(function (r) {
        if (r.status === "ok" && r.items.length > 0) cacheSet(name, r.items);
        return r;
      });
    })).then(function (results) {
      var data = { updated_at: new Date().toLocaleTimeString("zh-CN", { hour12: false }), platforms: {} };
      var aiTotal = 0, allTotal = 0;
      results.forEach(function (r, i) {
        var name = names[i];
        var items = r.items || [];
        items.forEach(function (it) { it.ai_match = matchAI(it); });
        allTotal += items.length;
        aiTotal += items.filter(function (it) { return it.ai_match.matched; }).length;
        data.platforms[name] = { status: r.status, items: items, error: r.error || "", source: r.source || "" };
        state.sources[name] = r.source || "";
      });
      data.ai_filtered_count = aiTotal;
      data.total_count = allTotal;
      return data;
    });
  }

  // Smart loader: try unified API first, fall back to direct+CORS proxy
  function loadData() {
    // Use the unified API if we're on a real server (not file://)
    if (window.location.protocol !== "file:") {
      return loadFromAPI().catch(function () {
        console.log("统一API不可用，回退到直接模式");
        return loadAllData();
      });
    }
    return loadAllData();
  }

  // ═══════════════════════════════════════════
  // Filtering helpers
  // ═══════════════════════════════════════════
  function getFilteredItems(items) {
    if (!items) return [];
    var q = state.searchTerm.toLowerCase();
    var mode = state.filterMode;
    return items.filter(function (it) {
      if (mode === "ai" && !it.ai_match.matched) return false;
      if (mode === "tier1" && it.ai_match.tier !== 1) return false;
      if (q) {
        var txt = ((it.show_name || "") + " " + it.keyword).toLowerCase();
        if (txt.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // ═══════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════
  function renderCardColumn(name) {
    var p = state.data && state.data.platforms ? state.data.platforms[name] : null;
    var meta = PLATFORMS[name];
    var items = p ? p.items : [];
    var filtered = getFilteredItems(items);
    var allAi = items.filter(function (it) { return it.ai_match.matched; }).length;

    var card = document.getElementById("card-" + name);
    if (!card) {
      // Create card
      card = document.createElement("article");
      card.className = "rank-card";
      card.id = "card-" + name;
      card.style.setProperty("--card-delay", ({ bilibili: "0.2s", weibo: "0.3s", douyin: "0.4s" })[name]);
      document.getElementById("cardsGrid").appendChild(card);
    }

    var statusCls = p && p.status === "error" ? " error" : "";
    var sourceName = state.sources[name] || (p ? p.source : "") || "";

    var html = "";
    html += '<div class="card-head">';
    html += '<div>';
    html += '<div class="card-platform">';
    html += '<div class="platform-icon ' + meta.iconClass + '">' + meta.symbol + "</div>";
    html += "<h2>" + meta.label + "</h2>";
    html += "</div>";
    html += '<div class="card-source">' + (sourceName ? "来源: " + escHtml(sourceName) : "加载中…") + "</div>";
    html += "</div>";
    html += '<div class="card-count">' + (items.length ? "AI " + allAi + "/" + items.length : "—") + "</div>";
    html += "</div>";

    if (!p) {
      // Loading skeleton
      html += '<div class="rank-list">';
      for (var s = 0; s < 8; s++) html += '<div class="skeleton-item"></div>';
      html += "</div>";
    } else if (p.status === "error") {
      var errMsg = escHtml(p.error || "加载失败");
      if (window.location.protocol === "file:") {
        errMsg += '<br><small style="color:#856404">💡 请双击 <b>start.bat</b> 启动本地服务器后重试</small>';
      }
      html += '<div class="card-empty">' + errMsg + "</div>";
    } else if (filtered.length === 0) {
      if (state.filterMode !== "all" || state.searchTerm) {
        html += '<div class="card-empty">当前筛选条件下无匹配热点</div>';
      } else {
        html += '<div class="card-empty">暂无数据</div>';
      }
    } else {
      html += '<div class="rank-list">';
      for (var i = 0; i < Math.min(filtered.length, 50); i++) {
        var item = filtered[i];
        var ai = item.ai_match || { matched: false, tier: 0, keyword: "" };
        var rankCls = item.rank <= 3 ? " r" + item.rank : "";
        var heatStr = item.heat_str || fmtHeat(item.heat_score);
        var url = item.url || meta.searchUrl(item.keyword);

        html += '<a class="rank-item" href="' + escHtml(url) + '" target="_blank" rel="noopener">';
        html += '<span class="rank-num' + rankCls + '">' + (item.rank || i + 1) + "</span>";
        html += '<span class="rank-text">' + escHtml(item.show_name || item.keyword) + "</span>";
        html += '<span class="rank-meta">';
        if (ai.matched) {
          html += '<span class="rank-tag ' + (ai.tier === 1 ? "ai-tier1" : "ai-tier2") + '">' + escHtml(ai.keyword) + "</span>";
        }
        if (item.label) html += '<span class="rank-tag hot">' + escHtml(item.label) + "</span>";
        if (heatStr) html += '<span class="rank-heat">' + heatStr + "</span>";
        html += "</span></a>";
      }
      html += "</div>";
    }

    card.innerHTML = html;

    // Update live pill
    updateLivePill();

    // Update nav badges
    var badge = document.getElementById("navBadge-" + name);
    if (badge && items.length) {
      badge.textContent = allAi > 0 ? allAi : items.length;
    }
  }

  function renderAllCards() {
    var grid = document.getElementById("cardsGrid");
    if (!grid) return;

    if (state.activeTab) {
      // Show single platform
      grid.innerHTML = "";
      renderCardColumn(state.activeTab);
    } else {
      // Show all three
      ["bilibili", "weibo", "douyin"].forEach(function (name) {
        renderCardColumn(name);
      });
    }
    renderAnalysis();
  }

  function renderAnalysis() {
    // Platform AI stats
    var totalAi = 0;
    var platformCounts = {};

    ["bilibili", "weibo", "douyin"].forEach(function (name) {
      var p = state.data && state.data.platforms ? state.data.platforms[name] : null;
      var items = p ? p.items : [];
      var aiCount = items.filter(function (it) { return it.ai_match.matched; }).length;
      platformCounts[name] = { total: items.length, ai: aiCount };
      totalAi += aiCount;
    });

    var maxAi = Math.max(1, platformCounts.bilibili.ai, platformCounts.weibo.ai, platformCounts.douyin.ai);

    function setBar(name, idSuffix) {
      var c = platformCounts[name];
      var pct = c.ai > 0 ? Math.round((c.ai / maxAi) * 100) : 0;
      var fillEl = document.getElementById("stat" + idSuffix);
      var valEl = document.getElementById("stat" + idSuffix + "Val");
      if (fillEl) fillEl.style.width = pct + "%";
      if (valEl) valEl.textContent = c.ai + "/" + c.total;
    }

    setBar("bilibili", "Bili");
    setBar("weibo", "Weibo");
    setBar("douyin", "Douyin");

    // Update AI count display
    var totalAll = (state.data && state.data.total_count) || 0;
    var totalAiCount = (state.data && state.data.ai_filtered_count) || 0;
    var countEl = document.getElementById("totalAiCount");
    if (countEl) countEl.textContent = totalAiCount + "/" + totalAll;

    // Keyword cloud
    renderKeywordCloud();
  }

  function renderKeywordCloud() {
    var cloud = document.getElementById("keywordCloud");
    if (!cloud) return;

    // Collect all matched AI keywords
    var kwCount = {};
    ["bilibili", "weibo", "douyin"].forEach(function (name) {
      var p = state.data && state.data.platforms ? state.data.platforms[name] : null;
      (p ? p.items : []).forEach(function (it) {
        if (it.ai_match && it.ai_match.matched) {
          var kw = it.ai_match.keyword;
          kwCount[kw] = (kwCount[kw] || 0) + 1;
        }
      });
    });

    var entries = Object.keys(kwCount).map(function (k) {
      return { keyword: k, count: kwCount[k], tier: getKeywordTier(k) };
    });
    entries.sort(function (a, b) { return b.count - a.count; });

    if (entries.length === 0) {
      cloud.innerHTML = '<span class="keyword-tag no-match">暂无匹配的 AI 关键词</span>';
      return;
    }

    cloud.innerHTML = entries.slice(0, 15).map(function (e) {
      var cls = e.tier === 1 ? "tier1" : e.tier === 2 ? "tier2" : "no-match";
      return '<span class="keyword-tag ' + cls + '">' + escHtml(e.keyword) + " ×" + e.count + "</span>";
    }).join("");
  }

  function getKeywordTier(kw) {
    if (AI_TIER1.indexOf(kw) !== -1) return 1;
    if (AI_TIER2.indexOf(kw) !== -1) return 2;
    return 0;
  }

  function updateLivePill() {
    var pill = document.getElementById("livePill");
    var dot = pill ? pill.querySelector(".pulse-dot") : null;
    var text = document.getElementById("liveText");
    if (!pill || !dot || !text) return;

    // Check if any platform is in error
    var hasError = false;
    var hasData = false;
    ["bilibili", "weibo", "douyin"].forEach(function (name) {
      var p = state.data && state.data.platforms ? state.data.platforms[name] : null;
      if (!p) return;
      if (p.status === "error") hasError = true;
      if (p.status === "ok" || p.status === "stale") hasData = true;
    });

    if (hasError && !hasData) {
      dot.className = "pulse-dot error";
      text.textContent = "部分离线";
    } else {
      dot.className = "pulse-dot live";
      text.textContent = "实时监控中";
    }
  }

  // ═══════════════════════════════════════════
  // Refresh + Auto-refresh
  // ═══════════════════════════════════════════
  function refreshData() {
    return loadData().then(function (data) {
      state.data = data;
      renderAllCards();
      state.countdown = REFRESH_INTERVAL;
      updateCountdown();
      updateTime();
      console.log("数据来源:", Object.keys(data.platforms).map(function (k) {
        return k + "=" + (data.platforms[k].source || data.platforms[k].status);
      }).join(", "));
    }).catch(function (err) {
      console.error("加载失败:", err);
    });
  }

  function refreshNow() {
    var btn = document.getElementById("refreshBtn");
    if (!btn) return;
    var origHTML = btn.innerHTML;
    btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>刷新中…</span>';
    btn.disabled = true;
    cacheClearAll();
    return refreshData().finally(function () {
      setTimeout(function () {
        btn.innerHTML = origHTML;
        btn.disabled = false;
        showToast("✓ 已刷新最新热点");
      }, 500);
    });
  }

  function updateTime() {
    var el = document.getElementById("lastUpdated");
    if (el && state.data) el.textContent = state.data.updated_at;
  }

  function updateCountdown() {
    var el = document.getElementById("countdownDisplay");
    if (!el) return;
    if (state.autoRefresh && state.countdown >= 0) {
      el.textContent = "下次刷新: " + state.countdown + "s";
    } else {
      el.textContent = "自动刷新已关闭";
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (!state.autoRefresh) return;
    state.countdown = REFRESH_INTERVAL;
    updateCountdown();
    state.timerId = setInterval(function () {
      state.countdown--;
      updateCountdown();
      if (state.countdown <= 0) refreshData();
    }, 1000);
  }

  function stopAutoRefresh() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timeout);
    t._timeout = setTimeout(function () { t.classList.remove("show"); }, 2000);
  }

  // ═══════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════
  function bindEvents() {
    // Search
    var searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", debounce(function () {
        state.searchTerm = searchInput.value.trim();
        renderAllCards();
      }, 250));
    }

    // Filter select
    var filterSelect = document.getElementById("filterSelect");
    if (filterSelect) {
      filterSelect.addEventListener("change", function () {
        state.filterMode = filterSelect.value;
        renderAllCards();
      });
    }

    // Refresh button
    var refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", refreshNow);
    }

    // Nav tabs
    $$(".nav-item[data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.dataset.tab;
        if (state.activeTab === tab) {
          state.activeTab = null; // Deselect → show all
          $$(".nav-item[data-tab]").forEach(function (b) { b.classList.remove("active"); });
        } else {
          state.activeTab = tab;
          $$(".nav-item[data-tab]").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
        }
        renderAllCards();
      });
    });

    // "实时热榜" button → show all
    var allBtn = document.querySelector(".nav-item[data-view='trends']");
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        state.activeTab = null;
        $$(".nav-item[data-tab]").forEach(function (b) { b.classList.remove("active"); });
        renderAllCards();
      });
    }

    // Keyboard: Ctrl+K → focus search, F5 → refresh
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        var inp = document.getElementById("searchInput");
        if (inp) inp.focus();
      }
      if (e.key === "F5" || (e.key === "r" && e.ctrlKey)) {
        e.preventDefault();
        refreshNow();
      }
    });

    // Auto-refresh toggle (use a hidden checkbox or add to UI)
    // For now, default ON
  }

  // ═══════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════
  function init() {
    bindEvents();

    // Detect file:// protocol and show a helpful banner
    if (window.location.protocol === "file:") {
      var banner = document.createElement("div");
      banner.style.cssText =
        "background:#fff3cd;color:#856404;text-align:center;padding:10px 16px;" +
        "font-size:13px;border-bottom:1px solid #ffc107;position:sticky;top:0;z-index:50;" +
        "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap";
      banner.innerHTML =
        '<span>⚠ 从 file:// 打开可能导致部分数据源（微博/抖音）无法加载</span>' +
        '<a href="#" id="bannerFixLink" style="color:#0d6efd;font-weight:600;text-decoration:underline;cursor:pointer">双击 start.bat 启动本地服务器</a>' +
        '<button id="bannerDismiss" style="background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px;color:#856404">&times;</button>';
      document.body.insertBefore(banner, document.body.firstChild);

      document.getElementById("bannerFixLink").addEventListener("click", function (e) {
        e.preventDefault();
        banner.innerHTML =
          '<span>💡 请关闭此页面，在文件夹中双击 <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700">start.bat</code> 即可自动启动本地服务器并打开浏览器</span>' +
          '<button id="bannerDismiss2" style="background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px;color:#856404">&times;</button>';
        document.getElementById("bannerDismiss2").addEventListener("click", function () { banner.remove(); });
      });
      document.getElementById("bannerDismiss").addEventListener("click", function () { banner.remove(); });

      console.warn("检测到 file:// 协议。建议使用 start.bat 启动本地服务器以获取完整数据。");
    }

    // Show skeleton cards
    var grid = document.getElementById("cardsGrid");
    if (grid) {
      ["bilibili", "weibo", "douyin"].forEach(function (name) {
        var meta = PLATFORMS[name];
        var card = document.createElement("article");
        card.className = "rank-card";
        card.id = "card-" + name;
        card.innerHTML =
          '<div class="card-head"><div><div class="card-platform"><div class="platform-icon ' + meta.iconClass + '">' + meta.symbol + '</div><h2>' + meta.label + '</h2></div><div class="card-source">加载中…</div></div><div class="card-count">—</div></div><div class="rank-list">' +
          Array.from({ length: 8 }, function () { return '<div class="skeleton-item"></div>'; }).join("") +
          "</div>";
        grid.appendChild(card);
      });
    }

    refreshData().then(function () {
      startAutoRefresh();
    });
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
