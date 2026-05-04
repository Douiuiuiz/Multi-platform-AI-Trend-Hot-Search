# -*- coding: utf-8 -*-
import requests
from config import USER_AGENT, REQUEST_TIMEOUT


class BaseFetcher:
    """所有 fetcher 的基类，提供通用请求逻辑"""

    name = "base"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def _get(self, url, headers=None, timeout=None):
        """GET 请求，自动处理超时和基础异常"""
        if timeout is None:
            timeout = REQUEST_TIMEOUT
        merged_headers = {}
        if headers:
            merged_headers.update(headers)
        try:
            resp = self.session.get(url, headers=merged_headers, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.RequestException:
            return None

    def fetch(self):
        """子类必须实现此方法，返回 {"status": "...", "items": [...]}"""
        raise NotImplementedError

    def build_result(self, status, items, error=None):
        return {
            "platform": self.name,
            "status": status,
            "items": items,
            "error": error,
        }
