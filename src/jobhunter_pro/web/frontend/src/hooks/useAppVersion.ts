import { useEffect, useState } from 'react'

let cachedVersion = ''

export function useAppVersion() {
  const [version, setVersion] = useState(cachedVersion)

  useEffect(() => {
    if (cachedVersion) return
    let cancelled = false
    fetch('/api/health', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (typeof data?.version === 'string' && data.version) {
          cachedVersion = data.version
          if (!cancelled) setVersion(data.version)
        }
      })
      .catch(() => {
        // 版本号只是展示信息，读取失败不影响页面。
      })
    return () => {
      cancelled = true
    }
  }, [])

  return version
}
