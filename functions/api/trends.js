// Cloudflare Worker — unified API proxy for B站/微博/抖音 trends
// Deployed as Cloudflare Pages Function at /api/trends

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const TIMEOUT = 10000;
const CACHE_TTL = 90; // seconds

// In-memory cache (per worker instance, resets on cold start)
const cache = new Map();

// AI Keywords
const AI_TIER1 = [
  "AI", "人工智能", "大模型", "LLM", "GPT", "ChatGPT", "Claude",
  "DeepSeek", "深度学习", "机器学习", "神经网络", "Transformer",
  "Stable Diffusion", "Midjourney", "Sora", "生成式AI", "AGI",
  "AIGC", "智能体", "Agent", "Copilot", "Gemini", "文心一言",
  "通义千问", "豆包", "混元", "百川", "Kimi", "元宝",
  "Grok", "Llama", "Qwen", "OpenAI", "Anthropic", "智谱",
  "ChatGLM", "强化学习", "多模态", "文生图", "文生视频",
  "Manus", "MCP",
];

const AI_TIER2 = [
  "模型", "训练", "推理", "数据集", "算力", "GPU", "NPU", "TPU",
  "提示词", "Prompt", "ChatBot", "机器人", "自动驾驶", "语音识别",
  "视觉", "NLP", "RAG", "向量", "embedding", "微调",
  "预训练", "开源模型", "国产芯片", "昇腾", "寒武纪",
  "CUDA", "Tensor", "PyTorch", "JAX", "HuggingFace",
  "LangChain", "Dify", "Coze", "扣子", "数字人", "具身智能",
  "无人驾驶", "智能驾驶", "AI绘画", "AI视频",
];

// ── Helpers ──────────────────────────────────

async function httpGet(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return resp;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

function matchAI(item) {
  const text = ((item.keyword || "") + " " + (item.show_name || "")).toLowerCase();
  for (const kw of AI_TIER1) {
    if (text.includes(kw.toLowerCase())) return { matched: true, tier: 1, keyword: kw };
  }
  for (const kw of AI_TIER2) {
    if (text.includes(kw.toLowerCase())) return { matched: true, tier: 2, keyword: kw };
  }
  return { matched: false, tier: 0, keyword: "" };
}

// ── Platform fetchers ─────────────────────────

async function fetchBilibili() {
  const r = await httpGet("https://s.search.bilibili.com/main/hotword");
  if (!r) return null;
  try {
    const data = await r.json();
    return (data.list || []).map((item, i) => ({
      rank: item.pos || i + 1,
      keyword: item.keyword || "",
      show_name: item.show_name || item.keyword || "",
      heat_score: item.heat_score || 0,
      label: item.heat_layer || "",
      url: "https://search.bilibili.com/all?keyword=" + encodeURIComponent(item.keyword || ""),
    }));
  } catch (e) {
    return null;
  }
}

async function fetchWeibo() {
  const r = await httpGet("https://tophub.today/n/KqndgxeLl9", {
    "Referer": "https://tophub.today/",
  });
  if (!r) return null;
  const html = await r.text();
  return parseTopHub(html, "https://s.weibo.com/weibo?q=");
}

async function fetchDouyin() {
  const r = await httpGet("https://tophub.today/n/DpQvNABoNE", {
    "Referer": "https://tophub.today/",
  });
  if (!r) return null;
  const html = await r.text();
  return parseTopHubDouyin(html);
}

// ── HTML parsers ──────────────────────────────

function parseTopHub(html, searchPrefix) {
  const items = [];
  const re = /<tr[^>]*>\s*<td[^>]*>(\d+)\.?<\/td>\s*<td[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    items.push({
      rank: parseInt(m[1]),
      keyword: m[3].trim(),
      show_name: m[3].trim(),
      heat_score: 0,
      heat_str: m[4].trim(),
      label: "",
      url: m[2] || (searchPrefix + encodeURIComponent(m[3].trim())),
    });
  }
  return items;
}

function parseTopHubDouyin(html) {
  const items = [];
  const re = /<tr[^>]*>\s*<td[^>]*>(\d+)\.?<\/td>\s*<td[^>]*>.*?<\/td>\s*<td[^>]*>\s*<div>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const title = m[3].replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    items.push({
      rank: parseInt(m[1]),
      keyword: title,
      show_name: title,
      heat_score: 0,
      heat_str: "",
      label: "",
      url: m[2] || ("https://www.douyin.com/search/" + encodeURIComponent(title)),
    });
  }
  if (items.length === 0) return parseTopHub(html, "");
  return items;
}

// ── Cache helper ──────────────────────────────

async function cachedFetch(key, fetcher) {
  const entry = cache.get(key);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL * 1000) {
    return entry.data;
  }
  const data = await fetcher();
  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ── Request handler ───────────────────────────

export async function onRequest(context) {
  const { request } = context;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === "POST") {
    cache.clear();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all platforms
  const platforms = {};
  const fetchers = [
    ["bilibili", fetchBilibili],
    ["weibo", fetchWeibo],
    ["douyin", fetchDouyin],
  ];

  await Promise.all(fetchers.map(async ([name, fn]) => {
    const items = await cachedFetch(name, fn);
    if (items && items.length > 0) {
      items.forEach(it => { it.ai_match = matchAI(it); });
      platforms[name] = { status: "ok", items, error: "" };
    } else {
      platforms[name] = { status: "error", items: [], error: "数据源不可用" };
    }
  }));

  const aiTotal = Object.values(platforms)
    .reduce((sum, p) => sum + p.items.filter(it => it.ai_match?.matched).length, 0);
  const total = Object.values(platforms)
    .reduce((sum, p) => sum + p.items.length, 0);

  const result = {
    updated_at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    platforms,
    ai_filtered_count: aiTotal,
    total_count: total,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
