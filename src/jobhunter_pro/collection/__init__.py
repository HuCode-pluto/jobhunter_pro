"""Shared collection contracts and multi-platform orchestration."""

from jobhunter_pro.collection.models import (
    CollectionProgress,
    JobCandidate,
    PlatformCollectionRequest,
    PlatformCollectionResult,
)

__all__ = [
    "CollectionProgress",
    "JobCandidate",
    "PlatformCollectionRequest",
    "PlatformCollectionResult",
]
