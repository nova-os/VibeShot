import { useEffect, useRef, useCallback } from 'react'

interface UsePollingOptions {
  /** Polling interval in milliseconds (default: 30000 = 30 seconds) */
  interval?: number
  /** Whether polling is enabled (default: true) */
  enabled?: boolean
  /** Pause polling when tab is hidden (default: true) */
  pauseWhenHidden?: boolean
}

/**
 * Hook for polling data at regular intervals.
 * Automatically pauses when the browser tab is hidden.
 * 
 * @param callback - Function to call on each poll
 * @param options - Polling configuration options
 */
export function usePolling(
  callback: () => void | Promise<void>,
  options: UsePollingOptions = {}
) {
  const {
    interval = 10000,
    enabled = true,
    pauseWhenHidden = true,
  } = options

  const savedCallback = useRef(callback)
  const intervalRef = useRef<number | null>(null)

  // Update saved callback when it changes
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const startPolling = useCallback(() => {
    if (intervalRef.current) return // Already polling

    intervalRef.current = window.setInterval(() => {
      savedCallback.current()
    }, interval)
  }, [interval])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Handle visibility changes
  useEffect(() => {
    if (!pauseWhenHidden) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else if (enabled) {
        // Refresh immediately when tab becomes visible again
        savedCallback.current()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, pauseWhenHidden, startPolling, stopPolling])

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (enabled && !document.hidden) {
      startPolling()
    } else {
      stopPolling()
    }

    return stopPolling
  }, [enabled, startPolling, stopPolling])

  return {
    startPolling,
    stopPolling,
  }
}
