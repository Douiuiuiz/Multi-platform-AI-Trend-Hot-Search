# -*- coding: utf-8 -*-

# 缓存TTL（秒）
CACHE_TTL = 120

# 请求超时（秒）
REQUEST_TIMEOUT = 8

# 通用浏览器UA
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ── 平台 API ──────────────────────────────────────

BILIBILI_HOTWORD_URL = "https://s.search.bilibili.com/main/hotword"
BILIBILI_SEARCH_URL = "https://search.bilibili.com/all?keyword={keyword}"

WEIBO_HOTSEARCH_URL = "https://weibo.com/ajax/side/hotSearch"
WEIBO_SEARCH_URL = "https://s.weibo.com/weibo?q={keyword}"

DOUYIN_HOT_URL = "https://www.douyin.com/hot"
DOUYIN_TOPHUB_URL = "https://tophub.today/n/DpQvNABoNE"
DOUYIN_SEARCH_URL = "https://www.douyin.com/search/{keyword}"

# ── AI 关键词 ─────────────────────────────────────

# Tier 1: 高相关（红色badge）
AI_KEYWORDS_TIER1 = [
    "AI", "人工智能", "大模型", "LLM", "GPT", "ChatGPT", "Claude",
    "DeepSeek", "深度学习", "机器学习", "神经网络", "Transformer",
    "Stable Diffusion", "Midjourney", "Sora", "生成式AI", "AGI",
    "AIGC", "智能体", "Agent", "Copilot", "Gemini", "文心一言",
    "通义千问", "豆包", "混元", "360智脑", "百川", "Kimi", "元宝",
    "Grok", "Llama", "Qwen", "OpenAI", "Anthropic", "智谱",
    "ChatGLM", "强化学习", "多模态", "文生图", "文生视频",
]

# Tier 2: 相关（橙色badge）
AI_KEYWORDS_TIER2 = [
    "模型", "训练", "推理", "数据集", "算力", "GPU", "NPU", "TPU",
    "提示词", "Prompt", "ChatBot", "机器人", "自动驾驶", "语音识别",
    "视觉", "Computer Vision", "NLP", "RAG", "向量", "embedding",
    "微调", "fine-tune", "预训练", "开源模型", "国产芯片", "昇腾",
    "寒武纪", "摩尔线程", "CUDA", "Tensor", "PyTorch", "JAX",
    "HuggingFace", "LangChain", "Dify", "Coze", "扣子",
    "数字人", "人形机器人", "具身智能",
]
