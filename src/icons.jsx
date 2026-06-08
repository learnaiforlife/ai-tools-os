import React from "react";

/* icons.jsx — line icon set (simple geometric strokes) */
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  skill: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z",
  mcp: "M5 7h14M5 12h14M5 17h9 M3 7h.01M3 12h.01M3 17h.01",
  memory: "M4 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2zM14 3v5h5M8 13h8M8 17h5",
  config: "M4 4h16M4 4v16M4 20h16 M8 9l2 2-2 2M13 13h3",
  tools: "M14 7a4 4 0 00-5.4 5.4L3 18l3 3 5.6-5.6A4 4 0 0014 7z",
  security: "M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z M9 12l2 2 4-4",
  tokens: "M3 13l4-4 4 3 7-7M21 5v5h-5 M3 21h18",
  palette: "M5 8h14M5 8l-2 8h18l-2-8M9 12h6",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6z M19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 2 2 0 11-3.9 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1-2.7 2 2 0 010-3.9 1.6 1.6 0 001-2.7l-.1-.1A2 2 0 116.5 3.5l.1.1a1.6 1.6 0 002.7-.7 2 2 0 013.9 0 1.6 1.6 0 002.7.7l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.7 2.7z",
  search: "M11 4a7 7 0 105.7 11.1L21 21M11 4a7 7 0 00-5.7 11.1A7 7 0 0011 4z",
  plus: "M12 5v14M5 12h14",
  chevR: "M9 6l6 6-6 6", chevD: "M6 9l6 6 6-6", chevL: "M15 6l-6 6 6 6", chevUp: "M6 15l6-6 6 6",
  check: "M5 12l5 5L20 6", x: "M6 6l12 12M18 6L6 18",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  play: "M6 4l14 8-14 8z", stop: "M6 6h12v12H6z", pause: "M8 5v14M16 5v14", restart: "M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 4v4h4",
  trash: "M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13",
  edit: "M4 20l4-1 11-11-3-3L5 16zM14 5l3 3",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  download: "M12 3v12M7 11l5 5 5-5M4 21h16",
  upload: "M12 21V9M7 13l5-5 5 5M4 3h16",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  folder: "M3 6a1 1 0 011-1h5l2 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  graph: "M6 18a3 3 0 100-6 3 3 0 000 6zM18 18a3 3 0 100-6 3 3 0 000 6zM12 6a3 3 0 100-0.01M12 6L7 13M12 6l5 7M12 6a3 3 0 100 0",
  warn: "M12 3l9 16H3zM12 9v5M12 17h.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
  alert: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M13 15h4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7 15h10",
  history: "M3 12a9 9 0 109-9 9 9 0 00-7 3.3L3 8M3 4v4h4M12 8v4l3 2",
  sparkles: "M12 4l1.5 3.5L17 9l-3.5 1.5L12 14l-1.5-3.5L7 9l3.5-1.5zM19 14l.8 1.8L21 17l-1.2.6L19 19l-.8-1.4L17 17l1.2-.5z",
  link: "M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1",
  unlink: "M9 9L7 7a4 4 0 00-2 6M15 15l2 2a4 4 0 002-6M8 16l-1 1M16 8l1-1M4 4l16 16",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  arrowR: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6", arrowDn: "M12 5v14M6 13l6 6 6-6",
  scope: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11a1 1 0 100 2 1 1 0 000-2z",
  cube: "M12 2l9 5v10l-9 5-9-5V7zM12 2v20M3 7l9 5 9-5",
  shield: "M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z",
  cpu: "M6 6h12v12H6zM9 9h6v6H9M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2",
  database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  refresh: "M21 12a9 9 0 01-9 9 9 9 0 01-7-3.3M3 12a9 9 0 019-9 9 9 0 017 3.3M3 21v-4h4M21 3v4h-4",
  command: "M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 10-3 3",
  sliders: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4",
  archive: "M3 4h18v4H3zM5 8v12h14V8M9 12h6",
  compress: "M8 3v4H4M16 3v4h4M8 21v-4H4M16 21v-4h4",
  split: "M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4",
  merge: "M7 3v6a5 5 0 005 5h5M17 3v6a5 5 0 01-5 5M17 21l3-3-3-3",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  external: "M14 5h5v5M19 5l-9 9M12 5H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-6",
  drag: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0",
  pin: "M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  sun: "M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  bot: "M9 2h6M12 2v3M5 5h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM9 11h.01M15 11h.01M9 15h6M2 10v4M22 10v4",
  users: "M16 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM8.5 13a3 3 0 100-6 3 3 0 000 6zM2 20a6.5 6.5 0 0113 0M14.5 14a6 6 0 017.5 6",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 3v16M8 8h7M8 11h5",
  bookmark: "M6 3h12a1 1 0 011 1v17l-7-4.5L5 21V4a1 1 0 011-1z",
  award: "M12 3a5 5 0 100 10 5 5 0 000-10zM8.5 12L7 21l5-2.8L17 21l-1.5-9",
  slash: "M9 5h11M9 12h11M9 19h11M4 7l-1 10",
  grad: "M12 4L2 9l10 5 10-5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M21 9v5",
  statusbar: "M3 14h18v5H3zM6 16.5h4M14 16.5h4M3 5h18M3 9h12",
  gitbranch: "M6 4v12M6 16a2 2 0 100 4 2 2 0 000-4zM6 4a2 2 0 100-0.01M18 7a2 2 0 100-4 2 2 0 000 4zM18 7c0 5-6 4-6 9",
  dollar: "M12 2v20M16 6.5c0-2-2-3.5-4-3.5s-4 1-4 3.5 2 3 4 3.5 4 1.5 4 3.5-2 3.5-4 3.5-4-1.5-4-3.5",
};

function Icon({ name, size = 16, sw = 1.7, fill = false, style, className }) {
  const d = ICONS[name] || ICONS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flex: "none", ...style }} className={className}>
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

export { Icon, ICONS };
