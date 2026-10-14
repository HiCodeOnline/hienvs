// 任务日志查看器：轮询读取任务日志文件
import { useEffect, useRef, useState } from 'react'

export function LogViewer({ taskId }: { taskId: string }) {
  const [lines, setLines] = useState<string[]>([])
  const [follow, setFollow] = useState(true)
  const offsetRef = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stopped = false
    offsetRef.current = 0
    setLines([])

    async function poll() {
      try {
        const res = await window.api.tasksGetLog(taskId, offsetRef.current)
        if (stopped) return
        if (res.lines.length > 0) {
          offsetRef.current = res.nextOffset
          setLines((prev) => [...prev, ...res.lines].slice(-2000))
        }
      } catch {
        /* 日志可能尚未生成 */
      }
    }

    void poll()
    const timer = setInterval(poll, 1200)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [taskId])

  useEffect(() => {
    if (follow && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight
    }
  }, [lines, follow])

  function lineClass(line: string): string {
    const lower = line.toLowerCase()
    if (lower.includes('[error]') || lower.includes('error:')) return 'text-red-500'
    if (lower.includes('[warn]') || lower.includes('warning:')) return 'text-amber-500'
    return 'text-zinc-600 dark:text-zinc-400'
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">执行日志</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 accent-brand-600"
          />
          自动滚动
        </label>
      </div>
      <div
        ref={boxRef}
        className="h-56 overflow-y-auto rounded-lg bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed dark:bg-zinc-950"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-500">暂无日志</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${lineClass(line)}`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
