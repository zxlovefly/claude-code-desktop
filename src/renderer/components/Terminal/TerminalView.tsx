import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

interface TerminalViewProps {
  sessionId: string
  visible: boolean
}

export function TerminalView({ sessionId, visible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unsubRef = useRef<(() => void)[]>([])

  useEffect(() => {
    if (!visible || !containerRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: '#388bfd26',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d2991d',
        blue: '#58a6ff',
        magenta: '#a371f7',
        cyan: '#39c5cf',
        white: '#e6edf3',
        brightBlack: '#6e7681',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#bc8cff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff',
      },
      allowTransparency: false,
      scrollback: 50000,
      allowProposedApi: true,
      windowsMode: false,
      smoothScrollDuration: 100,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon
    terminalRef.current = terminal

    // Open terminal in container
    terminal.open(containerRef.current!)

    // Try WebGL renderer (fallback to canvas)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      terminal.loadAddon(webgl)
    } catch {
      // WebGL not available, use default canvas renderer
    }

    // Fit on mount
    requestAnimationFrame(() => fitAddon.fit())

    // Listen for terminal data from main process
    const unsubData = window.electron.receive('terminal:data', (sId: unknown, data: unknown) => {
      if (sId === sessionId && terminalRef.current) {
        terminalRef.current.write(data as string)
      }
    })
    unsubRef.current.push(unsubData)

    // Send keystrokes to PTY
    terminal.onData((data: string) => {
      window.electron.send('terminal:input', sessionId, data)
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit() } catch { /* ignore */ }
        if (terminalRef.current) {
          const dims = fitAddon.proposeDimensions()
          if (dims) {
            window.electron.send('terminal:resize', sessionId, dims.cols, dims.rows)
          }
        }
      })
    })

    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      unsubRef.current.forEach(fn => fn())
      unsubRef.current = []
      terminal.dispose()
      terminalRef.current = null
    }
  }, [sessionId, visible])

  // Refit when window resizes (only for visible sessions)
  useEffect(() => {
    if (!visible || !fitAddonRef.current) return
    const handleResize = () => {
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [visible])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: visible ? 'block' : 'none',
      }}
    />
  )
}
