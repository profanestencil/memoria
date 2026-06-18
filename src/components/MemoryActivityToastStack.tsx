import { useEffect, useState } from 'react'
import {
  dismissMemoryActivity,
  formatMemoryActivityLine,
  subscribeMemoryActivity,
  type MemoryActivityNotice,
} from '@/lib/memoryNotifications'

export const MemoryActivityToastStack = () => {
  const [items, setItems] = useState<MemoryActivityNotice[]>([])

  useEffect(() => {
    const unsub = subscribeMemoryActivity(setItems)
    return () => {
      unsub()
    }
  }, [])

  if (!items.length) return null

  const top = items[0]

  return (
    <div className="mem-activity-toast-stack" aria-live="polite">
      <div className="mem-activity-toast" role="status">
        {top.thumbUrl ? (
          <img
            src={top.thumbUrl}
            alt=""
            className="mem-activity-toast__thumb"
            decoding="async"
          />
        ) : (
          <div className="mem-activity-toast__thumb mem-activity-toast__thumb--placeholder" aria-hidden />
        )}
        <p className="mem-activity-toast__text">{formatMemoryActivityLine(top)}</p>
        <button
          type="button"
          className="mem-activity-toast__close"
          aria-label="Dismiss notification"
          onClick={() => dismissMemoryActivity(top.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
