import type { SVGProps } from 'react'

// ── Nav Icons ──

export function IconNewTask(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14M5 12h14" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  )
}

export function IconAssistant(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 15c1.5 2 4.5 2 6 0" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeWidth="1.2" opacity="0.5" />
    </svg>
  )
}

export function IconProjects(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

export function IconExperts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.3L12 14.5 7.1 17l.9-5.3-4-3.9L9.5 7z" />
    </svg>
  )
}

export function IconAutomation(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

export function IconMore(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function IconWechat(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="currentColor" stroke="none" />
      <path d="M16 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="currentColor" stroke="none" />
      <path d="M12 2C6.477 2 2 6.015 2 11c0 2.4 1.2 4.5 3 6l-1 3 3.5-1.5c1.2.5 2.5.5 4 .5l.5-.5" />
      <path d="M16 14c3.5 0 6-2.5 6-5.5S19.5 3 16 3s-6 2.5-6 5.5c0 1.5.5 2.5 1.5 3.5L10 14l2 2 1-1.5" />
      <path d="M14 16l2 2 4-4" />
    </svg>
  )
}

// ── Scenario Icons ──

export function IconCode(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function IconOffice(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
      <path d="M12 12v2M8 12v2M16 12v2" />
    </svg>
  )
}

export function IconDesign(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="13.5" cy="6.5" r="3.5" />
      <path d="M14.5 2a4.5 4.5 0 010 9M6 22l3.5-9 5 5L18 8" />
    </svg>
  )
}

// ── Toolbar Icons ──

export function IconCraft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 4V2m0 2v2m0-2h2m-2 0h-2" />
      <path d="M6 20l3-8 5 5-8 3z" />
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}

export function IconAuto(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M21 3l-3 3M3 21l3-3" />
    </svg>
  )
}

export function IconSkill(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.3L12 14.5 7.1 17l.9-5.3-4-3.9L9.5 7z" />
    </svg>
  )
}

export function IconConnector(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M9 6h6M9 18h6M6 9v6M18 9v6" strokeWidth="1" opacity="0.4" />
    </svg>
  )
}

export function IconPermission(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function IconSend(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Status / Monitor Icons (hand-drawn, no emoji) ──

export function IconChart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  )
}

export function IconTarget(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

export function IconTrendUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

export function IconPieChart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z" />
    </svg>
  )
}

export function IconClipboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  )
}

export function IconCoin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M9 9.5c0-.8.7-1.5 1.5-1.5h1c1 0 2 .7 2 1.5s-.7 1.5-1.5 1.5h-2c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5h1c.8 0 1.5-.7 1.5-1.5" />
    </svg>
  )
}

export function IconFolder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-1.5-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

export function IconMonitor(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M7 10l2 2 3-2 4 3" strokeWidth="1.5" />
    </svg>
  )
}

// ── Provider Icons ──

export function IconDeepSeek(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <rect width="24" height="24" rx="6" fill="#4D6BFE" />
      <path d="M5 8.5c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5v7c0 .3-.2.5-.5.5h-2a.5.5 0 01-.5-.5v-7z" fill="#fff" opacity="0.9" />
      <path d="M9 6.5c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5v11c0 .3-.2.5-.5.5h-2a.5.5 0 01-.5-.5v-11z" fill="#fff" opacity="0.7" />
      <path d="M13 9c0-.3.2-.5.5-.5h2c.3 0 .5.2.5.5v6c0 .3-.2.5-.5.5h-2a.5.5 0 01-.5-.5V9z" fill="#fff" opacity="0.5" />
      <path d="M17 10.5c0-.3.2-.5.5-.5h1c.3 0 .5.2.5.5v3c0 .3-.2.5-.5.5h-1a.5.5 0 01-.5-.5v-3z" fill="#fff" opacity="0.3" />
    </svg>
  )
}

export function IconAnthropic(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <rect width="24" height="24" rx="6" fill="#D97757" />
      <path d="M14.5 6l-2.5 7-2.5-7H7l4 10h2l4-10h-2.5z" fill="#fff" />
    </svg>
  )
}

// ── Mascot ──

export function Mascot(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" {...props}>
      {/* Body */}
      <ellipse cx="24" cy="34" rx="14" ry="11" fill="#6c5ce7" opacity="0.15" />
      {/* Head */}
      <circle cx="24" cy="18" r="12" fill="white" stroke="#6c5ce7" strokeWidth="2" />
      {/* Ears */}
      <path d="M15 10l3-6 2 4" fill="#6c5ce7" opacity="0.3" />
      <path d="M33 10l-3-6-2 4" fill="#6c5ce7" opacity="0.3" />
      {/* Eyes */}
      <circle cx="19" cy="17" r="2.5" fill="#1a1a2e" />
      <circle cx="29" cy="17" r="2.5" fill="#1a1a2e" />
      <circle cx="20" cy="16" r="0.8" fill="white" />
      <circle cx="30" cy="16" r="0.8" fill="white" />
      {/* Nose */}
      <ellipse cx="24" cy="21" rx="1.8" ry="1.2" fill="#e17055" />
      {/* Mouth */}
      <path d="M21 23.5c1 1.5 3 1.5 4 0" stroke="#1a1a2e" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* Blush */}
      <ellipse cx="15" cy="21" rx="2.5" ry="1.5" fill="#e17055" opacity="0.15" />
      <ellipse cx="33" cy="21" rx="2.5" ry="1.5" fill="#e17055" opacity="0.15" />
      {/* Code bracket on forehead */}
      <path d="M20 11l-3 3 3 3M28 11l3 3-3 3" stroke="#6c5ce7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  )
}
