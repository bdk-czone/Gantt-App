import React from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Archive,
  BadgeCheck,
  Banknote,
  Blocks,
  BookMarked,
  BookOpen,
  Bot,
  Boxes,
  BrainCircuit,
  Briefcase,
  Building2,
  CalendarRange,
  CheckSquare,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Cloud,
  Code2,
  Cpu,
  Database,
  Factory,
  FileText,
  Flag,
  FlaskConical,
  FolderKanban,
  Gem,
  Globe2,
  GraduationCap,
  HardDrive,
  Headphones,
  KanbanSquare,
  KeyRound,
  Laptop,
  Layers3,
  LayoutDashboard,
  Lightbulb,
  Mail,
  MapPinned,
  Megaphone,
  MessageSquare,
  Mic2,
  MonitorSmartphone,
  Network,
  PackageOpen,
  Palette,
  PencilRuler,
  PhoneCall,
  PlugZap,
  Presentation,
  Receipt,
  Rocket,
  ScanLine,
  Scale,
  ScrollText,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  TableProperties,
  Tag,
  Target,
  UserRound,
  Users,
  Video,
  Workflow,
  Wrench,
} from 'lucide-react';

export interface AppearanceIconOption {
  value: string;
  label: string;
  group: string;
  keywords: string[];
  Icon: LucideIcon;
}

export const COLOR_OPTIONS = [
  '#2563EB',
  '#7C3AED',
  '#0F766E',
  '#F59E0B',
  '#DC2626',
  '#EC4899',
  '#0891B2',
  '#65A30D',
  '#4F46E5',
  '#334155',
] as const;

function createIconOption(
  value: string,
  label: string,
  group: string,
  Icon: LucideIcon,
  keywords: string[] = []
): AppearanceIconOption {
  return {
    value,
    label,
    group,
    Icon,
    keywords: [value, label, group, ...keywords].map((token) => token.toLowerCase()),
  };
}

export const ICON_GROUPS: Array<{ id: string; label: string; options: AppearanceIconOption[] }> = [
  {
    id: 'planner',
    label: 'Planner',
    options: [
      createIconOption('folder-kanban', 'Project board', 'Planner', FolderKanban, ['kanban', 'planner', 'workspace']),
      createIconOption('kanban-square', 'Board', 'Planner', KanbanSquare, ['kanban', 'columns']),
      createIconOption('layout-dashboard', 'Dashboard', 'Planner', LayoutDashboard, ['overview', 'home']),
      createIconOption('layers-3', 'Layers', 'Planner', Layers3, ['sections', 'structure']),
      createIconOption('blocks', 'Blocks', 'Planner', Blocks, ['modules', 'components']),
      createIconOption('table-properties', 'Table', 'Planner', TableProperties, ['table', 'fields', 'columns']),
      createIconOption('calendar-range', 'Timeline', 'Planner', CalendarRange, ['calendar', 'schedule', 'gantt']),
      createIconOption('sliders-horizontal', 'Controls', 'Planner', SlidersHorizontal, ['controls', 'settings']),
    ],
  },
  {
    id: 'business',
    label: 'Business',
    options: [
      createIconOption('briefcase', 'Briefcase', 'Business', Briefcase, ['client', 'account']),
      createIconOption('building-2', 'Company', 'Business', Building2, ['business', 'enterprise']),
      createIconOption('banknote', 'Budget', 'Business', Banknote, ['finance', 'money']),
      createIconOption('receipt', 'Invoice', 'Business', Receipt, ['billing', 'quote']),
      createIconOption('store', 'Storefront', 'Business', Store, ['marketplace', 'listing']),
      createIconOption('presentation', 'Presentation', 'Business', Presentation, ['pitch', 'deck']),
      createIconOption('megaphone', 'Campaign', 'Business', Megaphone, ['marketing', 'launch']),
      createIconOption('badge-check', 'Approved', 'Business', BadgeCheck, ['verified', 'approved']),
      createIconOption('flag', 'Milestone', 'Business', Flag, ['milestone', 'goal']),
      createIconOption('target', 'Target', 'Business', Target, ['goal', 'objective']),
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    options: [
      createIconOption('rocket', 'Launch', 'Delivery', Rocket, ['release', 'go live']),
      createIconOption('clipboard-list', 'Checklist', 'Delivery', ClipboardList, ['tasks', 'requirements']),
      createIconOption('clipboard-check', 'Complete list', 'Delivery', ClipboardCheck, ['done', 'approved']),
      createIconOption('check-square', 'Task list', 'Delivery', CheckSquare, ['task', 'todo']),
      createIconOption('package-open', 'Package', 'Delivery', PackageOpen, ['deliverable', 'bundle']),
      createIconOption('workflow', 'Workflow', 'Delivery', Workflow, ['process', 'flow']),
      createIconOption('scroll-text', 'Documentation', 'Delivery', ScrollText, ['docs', 'spec']),
      createIconOption('archive', 'Archive', 'Delivery', Archive, ['archive', 'history']),
      createIconOption('clock', 'Timeline clock', 'Delivery', Clock3, ['time', 'schedule', 'due']),
      createIconOption('circle-dot', 'Simple task', 'Delivery', CircleDot, ['basic', 'dot']),
    ],
  },
  {
    id: 'technology',
    label: 'Technology',
    options: [
      createIconOption('cloud', 'Cloud', 'Technology', Cloud, ['saas', 'hosting']),
      createIconOption('database', 'Database', 'Technology', Database, ['data', 'sql']),
      createIconOption('server-cog', 'Infrastructure', 'Technology', ServerCog, ['server', 'ops']),
      createIconOption('cpu', 'Compute', 'Technology', Cpu, ['engine', 'processor']),
      createIconOption('network', 'Network', 'Technology', Network, ['networking', 'mesh']),
      createIconOption('plug-zap', 'Integration', 'Technology', PlugZap, ['api', 'integration']),
      createIconOption('code-2', 'Code', 'Technology', Code2, ['development', 'engineering']),
      createIconOption('hard-drive', 'Storage', 'Technology', HardDrive, ['storage', 'files']),
      createIconOption('monitor-smartphone', 'Platforms', 'Technology', MonitorSmartphone, ['desktop', 'mobile']),
      createIconOption('globe-2', 'Web', 'Technology', Globe2, ['internet', 'website']),
      createIconOption('bot', 'Automation', 'Technology', Bot, ['ai', 'automation']),
      createIconOption('boxes', 'Systems', 'Technology', Boxes, ['services', 'systems']),
    ],
  },
  {
    id: 'people',
    label: 'People',
    options: [
      createIconOption('users', 'Team', 'People', Users, ['people', 'group']),
      createIconOption('user-round', 'Owner', 'People', UserRound, ['person', 'assignee']),
      createIconOption('phone-call', 'Call', 'People', PhoneCall, ['phone', 'meeting']),
      createIconOption('headphones', 'Support', 'People', Headphones, ['support', 'success']),
      createIconOption('mail', 'Email', 'People', Mail, ['mail', 'outreach']),
      createIconOption('message-square', 'Message', 'People', MessageSquare, ['chat', 'feedback']),
      createIconOption('video', 'Video', 'People', Video, ['video', 'recording']),
      createIconOption('map-pinned', 'Location', 'People', MapPinned, ['place', 'region']),
      createIconOption('mic-2', 'Interview', 'People', Mic2, ['podcast', 'voice']),
      createIconOption('graduation-cap', 'Training', 'People', GraduationCap, ['learning', 'onboarding']),
    ],
  },
  {
    id: 'creative',
    label: 'Creative',
    options: [
      createIconOption('sparkles', 'Ideas', 'Creative', Sparkles, ['creative', 'magic']),
      createIconOption('lightbulb', 'Insight', 'Creative', Lightbulb, ['idea', 'thinking']),
      createIconOption('palette', 'Design', 'Creative', Palette, ['brand', 'visual']),
      createIconOption('pencil-ruler', 'Design system', 'Creative', PencilRuler, ['ui', 'ux']),
      createIconOption('gem', 'Premium', 'Creative', Gem, ['value', 'special']),
      createIconOption('book-open', 'Knowledge', 'Creative', BookOpen, ['guide', 'reference']),
      createIconOption('book-marked', 'Playbook', 'Creative', BookMarked, ['handbook', 'playbook']),
      createIconOption('scan-line', 'Discovery', 'Creative', ScanLine, ['scan', 'research']),
      createIconOption('flask-conical', 'Experiment', 'Creative', FlaskConical, ['testing', 'lab']),
      createIconOption('brain-circuit', 'Strategy AI', 'Creative', BrainCircuit, ['ai', 'brain']),
    ],
  },
  {
    id: 'security',
    label: 'Security',
    options: [
      createIconOption('shield-check', 'Protected', 'Security', ShieldCheck, ['secure', 'approved']),
      createIconOption('shield-alert', 'Risk', 'Security', ShieldAlert, ['alert', 'risk']),
      createIconOption('key', 'Access', 'Security', KeyRound, ['key', 'credentials']),
      createIconOption('scale', 'Compliance', 'Security', Scale, ['legal', 'policy']),
      createIconOption('settings-2', 'Configuration', 'Security', Settings2, ['settings', 'preferences']),
      createIconOption('wrench', 'Maintenance', 'Security', Wrench, ['repair', 'ops']),
      createIconOption('factory', 'Operations', 'Security', Factory, ['operations', 'plant']),
      createIconOption('file-text', 'Contract', 'Security', FileText, ['document', 'file']),
      createIconOption('tag', 'Label', 'Security', Tag, ['tag', 'category']),
      createIconOption('laptop', 'Device', 'Security', Laptop, ['device', 'hardware']),
    ],
  },
];

export const ICON_OPTIONS: AppearanceIconOption[] = ICON_GROUPS.flatMap((group) => group.options);

const ICON_MAP = new Map(ICON_OPTIONS.map((option) => [option.value, option.Icon]));
const ICON_OPTION_MAP = new Map(ICON_OPTIONS.map((option) => [option.value, option]));

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return { red: 37, green: 99, blue: 235 };
  }

  return {
    red: parseInt(normalized.slice(0, 2), 16),
    green: parseInt(normalized.slice(2, 4), 16),
    blue: parseInt(normalized.slice(4, 6), 16),
  };
}

export function withAlpha(color: string | null | undefined, alpha: number, fallback = '#2563EB') {
  const { red, green, blue } = hexToRgb(color || fallback);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getAppearanceColor(color: string | null | undefined, fallback: string) {
  return color || fallback;
}

export function getAppearanceIcon(icon: string | null | undefined, fallback = 'circle-dot') {
  return ICON_MAP.get(icon || '') || ICON_MAP.get(fallback) || CircleDot;
}

export function getAppearanceIconOption(icon: string | null | undefined, fallback = 'circle-dot') {
  return ICON_OPTION_MAP.get(icon || '') || ICON_OPTION_MAP.get(fallback) || ICON_OPTIONS[0];
}

interface EntityIconProps extends Omit<LucideProps, 'color'> {
  icon: string | null | undefined;
  color?: string | null;
  fallbackIcon?: string;
}

export const EntityIcon: React.FC<EntityIconProps> = ({
  icon,
  color,
  fallbackIcon = 'circle-dot',
  strokeWidth,
  style,
  ...props
}) => {
  const Icon = getAppearanceIcon(icon, fallbackIcon);
  const glow = color ? `drop-shadow(0 1px 6px ${withAlpha(color, 0.22)})` : undefined;

  return (
    <Icon
      {...props}
      color={color || undefined}
      strokeWidth={strokeWidth ?? 1.9}
      absoluteStrokeWidth
      style={{ ...style, filter: glow }}
    />
  );
};
