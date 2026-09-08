/* Stroke icons on a 24px grid, one consistent style. No emoji, no glyph fonts. */
type P = { className?: string; size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconGrid = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
export const IconSchool = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 21h18" /><path d="M5 21V9l7-4.5L19 9v12" /><path d="M10 21v-5h4v5" />
  </svg>
);
export const IconAlert = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 9v4.5" /><path d="M12 17.5h.01" />
    <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3l-7.8-13.5a2 2 0 0 0-3.4 0z" />
  </svg>
);
export const IconCamera = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14.5 4h-5L8 6H4.5A1.5 1.5 0 0 0 3 7.5v11A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 19.5 6H16z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconGrant = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12.5" rx="2" /><circle cx="12" cy="12.25" r="2.75" />
  </svg>
);
export const IconCheckList = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" />
    <path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" />
  </svg>
);
export const IconSearch = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconDown = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
);
export const IconUp = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
);
export const IconChevron = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconPlus = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
);
export const IconExport = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 15V3" /><path d="m8 7 4-4 4 4" />
  </svg>
);
export const IconImage = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 17 5-5 4.5 4.5L17 13l3 3" />
  </svg>
);
export const IconMap = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m9 4 6 2.5 5-2v13l-5 2-6-2.5-5 2v-13z" /><path d="M9 4v13" /><path d="M15 6.5v13" />
  </svg>
);
