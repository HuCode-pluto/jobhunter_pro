"""手动流水线的 LLM 适配层：把 job-hunter 的 chat/chat_json/chat_vision 映射到
JobHunter Pro 的 ai.credentials 体系（OpenAI 兼容协议）。"""
import json
import re

from jobhunter_pro.ai.credentials import (
    AIRequestError,
    call_openai_compatible_chat,
    call_vision_text,
)


class ManualLLM:
    """job-hunter 兼容的 LLM 客户端接口（chat_json / chat_vision）。"""

    def __init__(self, config: dict):
        self.config = config

    def chat_json(self, system: str, user: str, temperature: float = 0.2) -> dict:
        """要求模型返回 JSON 并解析；容忍模型偶尔包一层代码块。"""
        raw = call_openai_compatible_chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            self.config,
            max_tokens=8192,
            json_mode=True,
            temperature=temperature,
        )
        match = re.search(r"\{.*\}", raw, re.S)
        try:
            return json.loads(match.group(0) if match else raw)
        except json.JSONDecodeError as exc:
            raise AIRequestError("invalid_response", "AI 返回的内容不是有效 JSON") from exc

    def chat_vision(self, system: str, user_text: str, image_base64: str, mime: str = "image/jpeg") -> str:
        """视觉理解：把图片（base64）和文字一起发给多模态模型。"""
        # 视觉模型走独立的 vision_llm 配置节（智谱 GLM-4V 等），系统提示词并入文本
        return call_vision_text(image_base64, mime, f"{system}\n\n{user_text}", self.config)
