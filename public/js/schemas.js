// Option definitions transcribed from https://gethomepage.dev/configs/ (Homepage 2.x).
// Every key here is written to the YAML files exactly as Homepage expects it.
import { ColorPicker, BackgroundEditor, SearchProviders } from "./pages/settings-parts.js";

const D = "https://gethomepage.dev";
export const DOCS = {
  settings: `${D}/configs/settings/`,
  services: `${D}/configs/services/`,
  bookmarks: `${D}/configs/bookmarks/`,
  infoWidgets: `${D}/configs/info-widgets/`,
  docker: `${D}/configs/docker/`,
  kubernetes: `${D}/configs/kubernetes/`,
  proxmox: `${D}/configs/proxmox/`,
  custom: `${D}/configs/custom-css-js/`,
  install: `${D}/installation/`,
  docker_install: `${D}/installation/docker/`,
  mcp: `${D}/configs/mcp/`,
  widgets: `${D}/widgets/`,
};

export const COLORS = [
  "slate", "gray", "zinc", "neutral", "stone", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "red", "white",
];
export const LANGUAGES = [
  ["ca", "Català"], ["de", "Deutsch"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["he", "עברית"],
  ["hr", "Hrvatski"], ["hu", "Magyar"], ["it", "Italiano"], ["nb-NO", "Norsk bokmål"], ["nl", "Nederlands"],
  ["pt", "Português"], ["ru", "Русский"], ["sv", "Svenska"], ["vi", "Tiếng Việt"],
  ["zh-Hans", "中文 (简体)"], ["zh-Hant", "中文 (繁體)"],
].map(([value, label]) => ({ value, label: `${label} (${value})` }));
const TARGETS = [
  { value: "_blank", label: "_blank — new tab" },
  { value: "_self", label: "_self — same tab" },
  { value: "_top", label: "_top — top window" },
];
const BLUR = ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
const SEARCH_PROVIDERS = ["google", "duckduckgo", "bing", "baidu", "brave", "custom"];
const TEXT_SIZES = ["4xl", "3xl", "2xl", "xl", "md", "sm", "xs"];
const STATUS_STYLES = [
  { value: "dot", label: "dot — green dot when healthy" },
  { value: "basic", label: "basic — UP / DOWN text" },
];
const boolOrString = (v) => (v === "true" ? true : v === "false" ? false : v);

// ---------- settings.yaml ----------

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    fields: [
      { key: "title", label: "Page title", placeholder: "Homepage" },
      { key: "description", label: "Page description", placeholder: "A description of my awesome homepage" },
      { key: "language", label: "Language", type: "select", options: LANGUAGES, help: "Locales like en-GB also work (e.g. for the date widget) — type them in the raw file if needed." },
      { key: "target", label: "Link target", type: "select", options: TARGETS, help: "How service and bookmark links open. Can be overridden per service." },
      { key: "startUrl", label: "Start URL", type: "url", placeholder: "/", help: "start_url for the installable app (PWA)." },
      { key: "base", label: "Base URL", type: "url", placeholder: "http://host.local/homepage", help: "Only for some reverse-proxy setups. Must be a full absolute URL." },
      { key: "favicon", label: "Favicon", type: "icon", help: "Full URL or a path relative to /app/public, e.g. /icons/favicon.png." },
      { key: "instanceName", label: "Instance name", placeholder: "public", help: "Used by Docker/Kubernetes discovery to tell multiple Homepage instances apart." },
      { type: "heading", label: "Behaviour" },
      { key: "hideVersion", label: "Hide version", type: "bool", help: "Hide the release version at the bottom of the page." },
      { key: "disableUpdateCheck", label: "Disable update check", type: "bool", help: "Stop checking GitHub for new releases." },
      { key: "disableIndexing", label: "Disable search engine indexing", type: "bool", help: "robots.txt disallow + noindex meta tag." },
      { key: "hideErrors", label: "Hide widget errors", type: "bool", help: "Hide API error messages of all service widgets." },
      { key: "showStats", label: "Show container stats", type: "bool", help: "Expand Docker / Proxmox stats for every service (per-service setting wins)." },
      { key: "statusStyle", label: "Status style", type: "select", options: STATUS_STYLES, placeholder: "Default — response time / container status" },
      { key: "logpath", label: "Log path", type: "url", placeholder: "/app/config", help: "A logs folder is created here. Use the LOG_TARGETS env var to choose stdout/file/both." },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    fields: [
      { key: "theme", label: "Theme", type: "select", options: ["dark", "light"], placeholder: "Not fixed — visitors can switch", help: "Fixing a theme hides the theme switcher." },
      { key: "color", label: "Color palette", type: "custom", render: (p) => ColorPicker(p), help: "Fixing a color hides the palette switcher." },
      { key: "background", label: "Background image", type: "custom", wide: true, render: (p) => BackgroundEditor(p) },
      { key: "cardBlur", label: "Card blur", type: "select", options: BLUR, help: "Blur behind service & bookmark cards. Not compatible with background blur/saturate/brightness." },
      { key: "headerStyle", label: "Header style", type: "select", options: ["underlined", "boxed", "clean", "boxedWidgets"], placeholder: "Default (underlined)" },
      { key: "cardStyle", label: "Card style", type: "select", options: [{ value: "hairline", label: "hairline — thin border instead of shadow" }], placeholder: "Default (shadow)" },
      { key: "blockStyle", label: "Widget block style", type: "select", options: [{ value: "refined", label: "refined — heavier, easier to read values" }], placeholder: "Default" },
      { key: "font", label: "Font", type: "select", options: [{ value: "plex", label: "plex — IBM Plex Mono everywhere" }, { value: "plexData", label: "plexData — Plex Mono for values only" }], placeholder: "Default (Manrope)" },
      { key: "iconStyle", label: "Prefixed icon style", type: "select", options: [{ value: "gradient", label: "gradient" }, { value: "theme", label: "theme — flat, matches the theme" }], placeholder: "Default (gradient)", help: "For mdi-/si- icons." },
      { type: "heading", label: "Layout" },
      { key: "fullWidth", label: "Full width", type: "bool", help: "Use the entire window width." },
      { key: "maxGroupColumns", label: "Max group columns", type: "select", options: [5, 6, 7, 8], placeholder: "Default (4 services / 6 bookmarks)", help: "Only for groups with the default column style." },
      { key: "maxBookmarkGroupColumns", label: "Max bookmark group columns", type: "select", options: [5, 6, 7, 8], placeholder: "Default (6)" },
      { key: "bookmarksStyle", label: "Bookmarks style", type: "select", options: [{ value: "icons", label: "icons — icons only, everywhere" }], placeholder: "Default" },
      { key: "disableCollapse", label: "Disable collapsible groups", type: "bool" },
      { key: "groupsInitiallyCollapsed", label: "Groups start collapsed", type: "bool", help: "Per-group setting on the Layout page wins." },
      { key: "useEqualHeights", label: "Equal height cards", type: "bool", help: "Per-group setting on the Layout page wins." },
      { type: "heading", label: "Highlight colors", help: "Tailwind classes used when a widget highlight rule matches." },
      { key: "blockHighlights.levels.good", label: "good", placeholder: "bg-emerald-500/40 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-400", mono: true, wide: true },
      { key: "blockHighlights.levels.warn", label: "warn", placeholder: "bg-amber-300/30 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", mono: true, wide: true },
      { key: "blockHighlights.levels.danger", label: "danger", placeholder: "bg-rose-700/45 text-rose-200 dark:bg-rose-950/70 dark:text-rose-400", mono: true, wide: true },
    ],
  },
  {
    id: "quicklaunch",
    label: "Quick Launch",
    intro: "Start typing anywhere on Homepage to search services, run a web search or open a URL.",
    fields: [
      { key: "quicklaunch.provider", label: "Search provider", type: "select", options: SEARCH_PROVIDERS, placeholder: "Inherit from search widget" },
      { key: "quicklaunch.url", label: "Custom search URL", type: "url", placeholder: "https://www.ecosia.org/search?q=", when: (v) => v.quicklaunch?.provider === "custom" },
      { key: "quicklaunch.suggestionUrl", label: "Custom suggestion URL", type: "url", placeholder: "https://ac.ecosia.org/autocomplete?type=list&q=", when: (v) => v.quicklaunch?.provider === "custom" },
      { key: "quicklaunch.target", label: "Open results in", type: "select", options: TARGETS },
      { key: "quicklaunch.searchDescriptions", label: "Search descriptions too", type: "bool" },
      { key: "quicklaunch.showSearchSuggestions", label: "Show search suggestions", type: "bool", defaultLabel: "Inherit" },
      { key: "quicklaunch.hideInternetSearch", label: "Hide internet search", type: "bool" },
      { key: "quicklaunch.hideVisitURL", label: "Hide 'visit URL' option", type: "bool" },
      { key: "quicklaunch.mobileButtonPosition", label: "Mobile button", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], placeholder: "Off" },
    ],
  },
  {
    id: "pwa",
    label: "App (PWA)",
    intro: "Options for installing Homepage as an app. Name, colors and display mode come from the other settings.",
    fields: [
      {
        key: "pwa.icons",
        label: "App icons",
        type: "objlist",
        addLabel: "Add icon",
        help: "Default: the Homepage icon in 192x192 and 512x512.",
        fields: [
          { key: "src", label: "Source", type: "icon" },
          { key: "type", label: "MIME type", placeholder: "image/png", suggestions: ["image/png", "image/svg+xml", "image/webp"] },
          { key: "sizes", label: "Sizes", placeholder: "192x192", suggestions: ["192x192", "512x512", "any"] },
        ],
      },
      {
        key: "pwa.shortcuts",
        label: "Shortcuts",
        type: "objlist",
        addLabel: "Add shortcut",
        help: "Links to tabs, e.g. /#media opens the Media tab.",
        fields: [
          { key: "name", label: "Name", placeholder: "Media" },
          { key: "url", label: "URL", type: "url", placeholder: "/#media" },
        ],
      },
    ],
  },
  {
    id: "providers",
    label: "Providers",
    intro: "Shared API keys. Widgets can then use `provider: <name>` instead of putting the key in every widget.",
    fields: [
      { key: "providers.openweathermap", label: "OpenWeatherMap API key", type: "secret" },
      { key: "providers.finnhub", label: "Finnhub API key (stocks)", type: "secret" },
      { type: "heading", label: "Longhorn" },
      { key: "providers.longhorn.url", label: "URL", type: "url", placeholder: "https://longhorn.example.com" },
      { key: "providers.longhorn.username", label: "Username" },
      { key: "providers.longhorn.password", label: "Password", type: "secret" },
    ],
  },
];

// ---------- layout (settings.yaml → layout) ----------

export { LAYOUT_OPTIONS } from "./convert.js";
export const LAYOUT_FIELDS = [
  { key: "tab", label: "Tab", placeholder: "No tab (shown on every tab)", help: "Tabs appear once any group has one. URL: /#tabname" },
  { key: "style", label: "Style", type: "select", options: [{ value: "row", label: "row — services side by side" }, { value: "column", label: "column" }], placeholder: "Default (column)" },
  { key: "columns", label: "Columns (row style)", type: "select", options: [1, 2, 3, 4, 5, 6, 7, 8], placeholder: "Default" },
  { key: "header", label: "Show header", type: "bool" },
  { key: "icon", label: "Group icon", type: "icon" },
  { key: "iconsOnly", label: "Icons only (bookmarks)", type: "bool" },
  { key: "initiallyCollapsed", label: "Start collapsed", type: "bool" },
  { key: "useEqualHeights", label: "Equal height cards", type: "bool" },
];

// ---------- services.yaml ----------

export const SERVICE_FIELDS = [
  { type: "heading", label: "Basics" },
  { key: "href", label: "Link (href)", type: "url", placeholder: "http://sonarr.host/" },
  { key: "description", label: "Description", placeholder: "Series management" },
  { key: "icon", label: "Icon", type: "icon", wide: true },
  { key: "target", label: "Link target", type: "select", options: TARGETS, placeholder: "Use global setting" },
  { key: "id", label: "Element id", placeholder: "myserviceid", help: "For targeting in custom CSS/JS." },
  { type: "heading", label: "Status monitoring" },
  { key: "siteMonitor", label: "Site monitor URL", type: "url", placeholder: "http://sonarr.host/", help: "HTTP HEAD (then GET) request; shows response time." },
  { key: "ping", label: "Ping host", placeholder: "sonarr.host", help: "ICMP ping (IPv4)." },
  { key: "statusStyle", label: "Status style", type: "select", options: STATUS_STYLES, placeholder: "Use global setting" },
  { key: "showStats", label: "Show stats expanded", type: "bool", defaultLabel: "Global" },
  { type: "heading", label: "Docker", help: "Show container status and CPU / memory / network." },
  { key: "server", label: "Docker server", type: "select", options: (v, ctx) => ctx?.dockerServers ?? [], placeholder: "None", help: "Servers are defined on the Integrations page." },
  { key: "container", label: "Container name", placeholder: "sonarr" },
  { type: "heading", label: "Kubernetes" },
  { key: "namespace", label: "Namespace", placeholder: "media" },
  { key: "app", label: "App", placeholder: "emby", help: "Matches pods labelled app.kubernetes.io/name=<app>." },
  { key: "podSelector", label: "Pod selector", wide: true, mono: true, placeholder: "app.kubernetes.io/instance in (a, b)", help: "Overrides app. An empty selector selects all pods in the namespace — set it in YAML as podSelector: \"\"." },
  { type: "heading", label: "Proxmox" },
  { key: "proxmoxNode", label: "Node", type: "select", options: (v, ctx) => ctx?.proxmoxNodes ?? [], placeholder: "None" },
  { key: "proxmoxVMID", label: "VM / LXC id", type: "number", placeholder: "101" },
  { key: "proxmoxType", label: "Type", type: "select", options: [{ value: "qemu", label: "qemu — VM" }, { value: "lxc", label: "lxc — container" }], placeholder: "Default (qemu)" },
  { type: "heading", label: "Ordering" },
  { key: "weight", label: "Weight", type: "number", help: "Mixes with discovered services. Default: (position + 1) × 100." },
];
export const SERVICE_KNOWN = ["widget", "widgets"];

// Options every service widget accepts (beyond its own).
export const WIDGET_COMMON_FIELDS = [
  { key: "hideErrors", label: "Hide errors", type: "bool" },
  { key: "headers", label: "Extra HTTP headers", type: "kv", keyPlaceholder: "X-Auth-Key", valuePlaceholder: "secret", help: "Sent with the widget's API requests (e.g. for a reverse proxy)." },
  {
    key: "highlight",
    label: "Block highlighting",
    type: "yaml",
    rows: 6,
    placeholder: "queued:\n  numeric:\n    - level: warn\n      when: gte\n      value: 5",
    help: "Per field: numeric rules (gt gte lt lte eq ne between outside) or string rules (equals includes startsWith endsWith regex), level good/warn/danger, optional negate / valueOnly / caseSensitive.",
  },
];

// ---------- bookmarks.yaml ----------

export const BOOKMARK_FIELDS = [
  { key: "href", label: "Link (href)", type: "url", required: true, placeholder: "https://github.com/" },
  { key: "abbr", label: "Abbreviation", placeholder: "GH", help: "Two letters, shown when there is no icon." },
  { key: "icon", label: "Icon", type: "icon", wide: true, help: "Takes precedence over the abbreviation." },
  { key: "description", label: "Description", placeholder: "Defaults to the link's hostname" },
  { key: "target", label: "Link target", type: "select", options: TARGETS, placeholder: "Use global setting" },
  { key: "id", label: "Element id", help: "For custom CSS/JS." },
];

// ---------- widgets.yaml (info widgets) ----------

const LINK = [
  { key: "href", label: "Link", type: "url", help: "Makes the widget clickable." },
  { key: "target", label: "Link target", type: "select", options: TARGETS, placeholder: "Use global setting" },
];
const MAPPINGS_HELP =
  "List of { field, label, format, remap, scale, prefix, suffix }. Formats: text number float percent duration bytes bitrate size date relativeDate.";

export const INFO_WIDGETS = {
  logo: {
    label: "Logo",
    description: "The Homepage logo, or your own icon.",
    fields: [{ key: "icon", label: "Icon", type: "icon", wide: true }, ...LINK],
  },
  greeting: {
    label: "Greeting",
    description: "Simple text.",
    fields: [{ key: "text", label: "Text", placeholder: "Hello!" }, { key: "text_size", label: "Text size", type: "select", options: TEXT_SIZES }, ...LINK],
  },
  datetime: {
    label: "Date & Time",
    description: "Clock, formatted with Intl.DateTimeFormat.",
    fields: [
      { key: "text_size", label: "Text size", type: "select", options: TEXT_SIZES },
      { key: "locale", label: "Locale", placeholder: "Use page language (e.g. nl, en-GB)" },
      { key: "format.dateStyle", label: "Date style", type: "select", options: ["full", "long", "medium", "short"], placeholder: "Hidden" },
      { key: "format.timeStyle", label: "Time style", type: "select", options: ["full", "long", "medium", "short"], placeholder: "Hidden" },
      { key: "format.hour12", label: "12-hour clock", type: "bool" },
      { key: "format.hourCycle", label: "Hour cycle", type: "select", options: ["h11", "h12", "h23", "h24"] },
      { key: "format", label: "All format options (YAML)", type: "yaml", rows: 4, help: "Any Intl.DateTimeFormat option, e.g. weekday: long. Edits here and above stay in sync." },
    ],
  },
  search: {
    label: "Search",
    description: "Search bar with Google, DuckDuckGo, Bing, Baidu, Brave or a custom engine.",
    fields: [
      {
        key: "provider",
        label: "Provider(s)",
        type: "custom",
        wide: true,
        render: ({ value, onChange }) => SearchProviders({ value, onChange }),
        help: "Pick several for a dropdown (custom can't be combined).",
      },
      { key: "url", label: "Custom search URL", type: "url", placeholder: "https://www.ecosia.org/search?q=", when: (v) => v.provider === "custom" },
      { key: "suggestionUrl", label: "Custom suggestion URL", type: "url", placeholder: "https://ac.ecosia.org/autocomplete?type=list&q=", when: (v) => v.provider === "custom" },
      { key: "focus", label: "Focus on page load", type: "bool" },
      { key: "showSearchSuggestions", label: "Search suggestions", type: "bool" },
      { key: "target", label: "Open results in", type: "select", options: [...TARGETS, { value: "_parent", label: "_parent" }] },
    ],
  },
  openmeteo: {
    label: "Open-Meteo weather",
    description: "Recommended weather widget, no API key needed.",
    fields: [
      { key: "label", label: "Label", placeholder: "Kyiv" },
      { key: "latitude", label: "Latitude", type: "number", placeholder: "50.449684", help: "Leave both empty to use the browser location (HTTPS only)." },
      { key: "longitude", label: "Longitude", type: "number", placeholder: "30.525026" },
      { key: "timezone", label: "Time zone", placeholder: "Europe/Kiev" },
      { key: "units", label: "Units", type: "select", options: ["metric", "imperial"] },
      { key: "cache", label: "Cache (minutes)", type: "number", placeholder: "5" },
      { key: "format", label: "Number format (Intl.NumberFormat)", type: "yaml", rows: 2, placeholder: "maximumFractionDigits: 1" },
    ],
  },
  openweathermap: {
    label: "OpenWeatherMap",
    description: "Needs the free One Call API subscription.",
    fields: [
      { key: "label", label: "Label" },
      { key: "latitude", label: "Latitude", type: "number" },
      { key: "longitude", label: "Longitude", type: "number" },
      { key: "units", label: "Units", type: "select", options: ["metric", "imperial"] },
      { key: "provider", label: "Provider", type: "select", options: ["openweathermap"], placeholder: "None — use API key", help: "Uses the key from Settings → Providers (recommended)." },
      { key: "apiKey", label: "API key", type: "secret", help: "Only if not using the provider; exposes the key in browser requests." },
      { key: "cache", label: "Cache (minutes)", type: "number", placeholder: "5" },
      { key: "format", label: "Number format (Intl.NumberFormat)", type: "yaml", rows: 2, placeholder: "maximumFractionDigits: 1" },
    ],
  },
  resources: {
    label: "Resources",
    description: "CPU, memory, disk, temperature, uptime and network of the Homepage container/host.",
    fields: [
      { key: "label", label: "Label", placeholder: "System" },
      { key: "cpu", label: "CPU", type: "bool" },
      { key: "memory", label: "Memory", type: "bool" },
      { key: "disk", label: "Disks (mount paths)", type: "list", placeholder: "/mnt/storage", help: "Disks must be mounted into the Homepage container." },
      { key: "cputemp", label: "CPU temperature", type: "bool" },
      { key: "tempmin", label: "Min temp", type: "number" },
      { key: "tempmax", label: "Max temp", type: "number" },
      { key: "units", label: "Temperature units", type: "select", options: ["metric", "imperial"] },
      { key: "uptime", label: "Uptime", type: "bool" },
      { key: "network", label: "Network", placeholder: "true, or an interface name like eno1", coerce: boolOrString, help: "Named host interfaces need /sys mounted read-only." },
      { key: "diskUnits", label: "Disk units", type: "select", options: ["bytes", "bbytes"] },
      { key: "refresh", label: "Refresh (ms)", type: "number", placeholder: "3000" },
      { key: "expanded", label: "Expanded view", type: "bool" },
    ],
  },
  glances: {
    label: "Glances",
    description: "Host resources from a Glances server (web server mode).",
    fields: [
      { key: "url", label: "URL", type: "url", required: true, placeholder: "http://host.or.ip:61208" },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", type: "secret" },
      { key: "version", label: "Glances version", type: "select", options: [3, 4], placeholder: "Default (3)" },
      { key: "label", label: "Label" },
      { key: "cpu", label: "CPU", type: "bool" },
      { key: "mem", label: "Memory", type: "bool" },
      { key: "cputemp", label: "CPU temperature", type: "bool" },
      { key: "cpuSensorLabel", label: "CPU sensor label prefix", placeholder: "Package id" },
      { key: "unit", label: "Temperature unit", type: "select", options: ["metric", "imperial"] },
      { key: "uptime", label: "Uptime", type: "bool" },
      { key: "disk", label: "Disks (mount points)", type: "list", placeholder: "/" },
      { key: "diskUnits", label: "Disk units", type: "select", options: ["bytes", "bbytes"] },
      { key: "expanded", label: "Expanded view", type: "bool" },
    ],
  },
  kubernetes: {
    label: "Kubernetes",
    description: "Cluster and node CPU / memory. Needs kubernetes.yaml configured.",
    fields: [
      { type: "heading", label: "Cluster" },
      { key: "cluster.show", label: "Show cluster", type: "bool" },
      { key: "cluster.cpu", label: "CPU", type: "bool" },
      { key: "cluster.memory", label: "Memory", type: "bool" },
      { key: "cluster.showLabel", label: "Show label", type: "bool" },
      { key: "cluster.label", label: "Label", placeholder: "cluster" },
      { type: "heading", label: "Nodes" },
      { key: "nodes.show", label: "Show nodes", type: "bool" },
      { key: "nodes.cpu", label: "CPU", type: "bool" },
      { key: "nodes.memory", label: "Memory", type: "bool" },
      { key: "nodes.showLabel", label: "Show node names", type: "bool" },
    ],
  },
  longhorn: {
    label: "Longhorn",
    description: "Longhorn storage usage. URL/credentials go in Settings → Providers → Longhorn.",
    fields: [
      { key: "expanded", label: "Expanded view", type: "bool" },
      { key: "total", label: "Show total", type: "bool" },
      { key: "labels", label: "Show node names", type: "bool" },
      { key: "nodes", label: "Show nodes", type: "bool" },
      { key: "include", label: "Only these nodes", type: "list", placeholder: "node1" },
    ],
  },
  stocks: {
    label: "Stocks",
    description: "Stock prices from Finnhub. Set the Finnhub key in Settings → Providers.",
    defaults: { provider: "finnhub" },
    fields: [
      { key: "provider", label: "Provider", type: "select", options: ["finnhub"], allowEmpty: false, placeholder: "finnhub" },
      { key: "watchlist", label: "Watchlist (max 8)", type: "list", placeholder: "NVDA" },
      { key: "color", label: "Colored changes", type: "bool" },
      { key: "cache", label: "Cache (minutes)", type: "number", placeholder: "1" },
    ],
  },
  unifi_console: {
    label: "UniFi Controller",
    description: "Connectivity status from a UniFi Network controller. Use a read-only local account.",
    fields: [
      { key: "url", label: "URL", type: "url", required: true, placeholder: "https://unifi.host.or.ip:port" },
      { key: "site", label: "Site", placeholder: "Default site" },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", type: "secret" },
      { key: "key", label: "API key", type: "secret", help: "Instead of username/password." },
    ],
  },
  customapi: {
    label: "Custom API",
    description: "Values from any JSON API, shown with an icon.",
    fields: [
      { key: "url", label: "URL", type: "url", required: true, wide: true },
      { key: "icon", label: "Icon", type: "icon", wide: true },
      { key: "label", label: "Label" },
      { key: "href", label: "Link", type: "url" },
      { key: "refreshInterval", label: "Refresh (ms)", type: "number", placeholder: "10000" },
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT"] },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", type: "secret" },
      { key: "headers", label: "Headers", type: "kv" },
      { key: "requestBody", label: "Request body", type: "yaml", rows: 3 },
      { key: "mappings", label: "Mappings", type: "yaml", rows: 8, help: MAPPINGS_HELP, placeholder: "- field: path.to.key\n  label: Field 1\n  format: number" },
    ],
  },
};

// ---------- docker.yaml / kubernetes.yaml / proxmox.yaml ----------

export const DOCKER_SOCKET_FIELDS = [
  { key: "socket", label: "Socket path", type: "url", placeholder: "/var/run/docker.sock", help: "Mount the socket into the Homepage container. Homepage must run as root or in the docker group." },
];
export const DOCKER_TCP_FIELDS = [
  { key: "host", label: "Host", placeholder: "dockerproxy or 192.168.0.101", required: true },
  { key: "port", label: "Port", type: "number", placeholder: "2375", required: true },
  { key: "protocol", label: "Protocol", type: "select", options: ["http", "https"], placeholder: "Default (http)", help: "https only when a reverse proxy serves the Docker API over TLS." },
  { type: "heading", label: "TLS client certificates", help: "Paths relative to the config folder." },
  { key: "tls.caFile", label: "CA file", placeholder: "tls/ca.pem" },
  { key: "tls.certFile", label: "Cert file", placeholder: "tls/cert.pem" },
  { key: "tls.keyFile", label: "Key file", placeholder: "tls/key.pem" },
  { key: "headers", label: "Headers", type: "kv", keyPlaceholder: "Authorization", valuePlaceholder: "Basic …" },
];
export const DOCKER_COMMON_FIELDS = [{ key: "swarm", label: "Docker Swarm", type: "bool", help: "Homepage must run on a manager node." }];

export const KUBERNETES_FIELDS = [
  {
    key: "mode",
    label: "Mode",
    type: "select",
    options: [
      { value: "disabled", label: "disabled" },
      { value: "default", label: "default — use kubeconfig" },
      { value: "cluster", label: "cluster — in-cluster service account" },
    ],
    placeholder: "Not configured",
  },
  { key: "ingress", label: "Ingress discovery", type: "bool", defaultLabel: "Default (on)" },
  { key: "traefik", label: "Traefik IngressRoute discovery", type: "bool" },
  { key: "gateway", label: "Gateway API HTTPRoute discovery", type: "bool" },
];

export const PROXMOX_FIELDS = [
  { key: "url", label: "URL", type: "url", required: true, placeholder: "https://proxmox.host.or.ip:8006" },
  { key: "token", label: "API token id", required: true, placeholder: "api@pam!homepage", mono: true },
  { key: "secret", label: "Token secret", type: "secret", required: true },
];
