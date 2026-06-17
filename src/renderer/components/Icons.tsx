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
