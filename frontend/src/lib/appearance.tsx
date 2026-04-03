import React from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Bot,
  Briefcase,
  CheckSquare,
  CircleDot,
  Cloud,
  Database,
  Flag,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  Layers3,
  Megaphone,
  MessageSquare,
  PhoneCall,
  PlugZap,
  Rocket,
  Scale,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';

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

export const ICON_OPTIONS: Array<{ value: string; label: string; Icon: LucideIcon }> = [
  { value: 'folder-kanban', label: 'Project', Icon: FolderKanban },
  { value: 'briefcase', label: 'Briefcase', Icon: Briefcase },
  { value: 'rocket', label: 'Rocket', Icon: Rocket },
  { value: 'cloud', label: 'Cloud', Icon: Cloud },
  { value: 'bot', label: 'Bot', Icon: Bot },
  { value: 'database', label: 'Database', Icon: Database },
  { value: 'megaphone', label: 'Campaign', Icon: Megaphone },
  { value: 'layers-3', label: 'Layers', Icon: Layers3 },
  { value: 'target', label: 'Target', Icon: Target },
  { value: 'shield-check', label: 'Security', Icon: ShieldCheck },
  { value: 'workflow', label: 'Workflow', Icon: Workflow },
  { value: 'flag', label: 'Flag', Icon: Flag },
  { value: 'circle-dot', label: 'Dot', Icon: CircleDot },
  { value: 'check-square', label: 'Checklist', Icon: CheckSquare },
  { value: 'message-square', label: 'Message', Icon: MessageSquare },
  { value: 'scale', label: 'Legal', Icon: Scale },
  { value: 'graduation-cap', label: 'Training', Icon: GraduationCap },
  { value: 'plug-zap', label: 'Integration', Icon: PlugZap },
  { value: 'flask-conical', label: 'Testing', Icon: FlaskConical },
  { value: 'phone-call', label: 'Calls', Icon: PhoneCall },
];

const ICON_MAP = new Map(ICON_OPTIONS.map((option) => [option.value, option.Icon]));

export function getAppearanceColor(color: string | null | undefined, fallback: string) {
  return color || fallback;
}

export function getAppearanceIcon(icon: string | null | undefined, fallback = 'circle-dot') {
  return ICON_MAP.get(icon || '') || ICON_MAP.get(fallback) || CircleDot;
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
  ...props
}) => {
  const Icon = getAppearanceIcon(icon, fallbackIcon);
  return <Icon {...props} color={color || undefined} />;
};
