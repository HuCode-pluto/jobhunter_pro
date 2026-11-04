"""ManualLLM 适配层与视觉调用的单元测试（mock 底层请求）。"""
import unittest
from unittest.mock import patch

from jobhunter_pro.ai.credentials import AIRequestError
from jobhunter_pro.manual.llm import ManualLLM


class ManualLLMTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "ai": {
                "provider": "openai_compatible",
                "service": "deepseek",
                "model": "deepseek-chat",
                "api_key": "sk-test",
                "base_url": "https://api.deepseek.com/v1",
            },
        }

    def test_chat_json_parses_plain_and_fenced_json(self):
        llm = ManualLLM(self.config)
        with patch("jobhunter_pro.manual.llm.call_openai_compatible_chat") as call:
            for raw in ('{"score": 60}', '```json\n{"score": 60}\n```'):
                with self.subTest(raw=raw):
                    call.return_value = raw
                    self.assertEqual(llm.chat_json("s", "u"), {"score": 60})
            args, kwargs = call.call_args
            self.assertTrue(kwargs["json_mode"])
            self.assertEqual(args[0][0]["role"], "system")

    def test_chat_json_invalid_response_raises_actionable_error(self):
        llm = ManualLLM(self.config)
        with patch("jobhunter_pro.manual.llm.call_openai_compatible_chat", return_value="不是 JSON"):
            with self.assertRaises(AIRequestError) as ctx:
                llm.chat_json("s", "u")
            self.assertIn("JSON", ctx.exception.user_message)

    def test_anthropic_provider_rejected_for_library_pipeline(self):
        llm = ManualLLM({"ai": {"provider": "anthropic", "model": "claude-sonnet-4-6"}})
        with self.assertRaises(AIRequestError) as ctx:
            llm.chat_json("s", "u")
        self.assertIn("OpenAI 兼容", ctx.exception.user_message)

    def test_chat_vision_uses_vision_config(self):
        llm = ManualLLM({**self.config, "vision_llm": {"api_key_env": "ZHIPU_API_KEY", "model": "glm-4v-flash"}})
        with (
            patch("jobhunter_pro.manual.llm.call_vision_text", return_value="识别文本") as vision,
            patch.dict("os.environ", {"ZHIPU_API_KEY": "test-key"}),
        ):
            text = llm.chat_vision("system", "用户文本", "aGVsbG8=")
            self.assertEqual(text, "识别文本")
            vision.assert_called_once_with("aGVsbG8=", "image/jpeg", "system\n\n用户文本", llm.config)


class VisionCredentialsTests(unittest.TestCase):
    def test_vision_defaults(self):
        from jobhunter_pro.ai.credentials import get_vision_credentials

        cfg = get_vision_credentials({})
        self.assertEqual(cfg["base_url"], "https://open.bigmodel.cn/api/paas/v4")
        self.assertEqual(cfg["api_key_env"], "ZHIPU_API_KEY")
        self.assertEqual(cfg["model"], "glm-4v-flash")

    def test_vision_missing_key_error(self):
        from jobhunter_pro.ai.credentials import call_vision_text

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(AIRequestError) as ctx:
                call_vision_text("aGVsbG8=", "image/jpeg", "p", {})
            self.assertIn("ZHIPU_API_KEY", ctx.exception.user_message)


if __name__ == "__main__":
    unittest.main()
