"""语音转写模块（手动流水线）。

支持两种方式（config.yaml asr.provider 配置）：
- paste    ：直接粘贴转写文本（零成本，任何场景可用，默认）
- whisper  ：本地 faster-whisper 转写（免费、隐私好，需 pip install jobhunter_pro[asr]，首次用会下载模型）

MP4 视频：用 ffmpeg 抽音轨后按普通音频处理（画面不参与分析，不影响成本）。
"""
import shutil
import subprocess
import tempfile
from pathlib import Path


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def extract_audio(video_path: Path) -> Path:
    """MP4 → 16k 单声道 wav（ffmpeg）。返回临时音频文件路径。"""
    if not ffmpeg_available():
        raise RuntimeError(
            "处理 MP4 需要 ffmpeg。安装：PowerShell 执行 winget install Gyan.FFmpeg，装完重开终端"
        )
    out = Path(tempfile.mktemp(suffix=".wav"))
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-ac", "1", "-ar", "16000", str(out),
        ],
        capture_output=True, timeout=600,
    )
    if not out.exists():
        raise RuntimeError("ffmpeg 音轨提取失败（视频可能损坏）")
    return out


def transcribe(audio_path: Path, cfg: dict) -> str:
    """按配置选择转写方式，返回转写文本。cfg 为 config.yaml 的 asr 节。"""
    cfg = cfg or {}
    provider = cfg.get("provider", "paste")
    if provider == "paste":
        raise RuntimeError("当前转写方式为手动粘贴：请直接粘贴转写文本")
    if provider == "whisper":
        return _whisper(audio_path, cfg)
    raise RuntimeError(f"未知转写方式：{provider}")


def _whisper(audio_path: Path, cfg: dict) -> str:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("未安装 faster-whisper：pip install jobhunter_pro[asr]（首次转写会自动下载模型，约 500MB）")
    model_size = cfg.get("whisper_model", "small")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio_path), language="zh", vad_filter=True)
    return "".join(seg.text for seg in segments)
