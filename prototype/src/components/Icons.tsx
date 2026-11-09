type P = { size?: number; className?: string };
const base = (size = 20) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const IconEdit = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M17.5 2.5a2.1 2.1 0 0 1 3 3L12 14l-4 1 1-4z" />
  </svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
export const IconMore = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
);
export const IconClose = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const IconGradient = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="3" width="13" height="13" rx="2" />
    <path d="M8 8h13v13H8z" />
    <path d="M12 21l9-9M16 21l5-5M8 17l9-9" />
  </svg>
);
export const IconImage = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
);
export const IconCopy = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconExternal = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
);
export const IconCheck = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
);
export const IconLock = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
