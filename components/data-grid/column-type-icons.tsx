/**
 * Column type icons — small Notion-style glyphs that sit before the
 * header label so an admin can scan a wide table and tell "this is a
 * select column" vs "this is a date column" at a glance.
 *
 * Lucide names chosen to match Notion's iconography as closely as
 * possible without pulling in a custom icon set.
 */
import {
  AtSign,
  Calendar,
  CheckSquare,
  ChevronsUpDown,
  Clock,
  Hash,
  Link as LinkIcon,
  ListChecks,
  Phone,
  Type,
  User,
  type LucideIcon,
} from "lucide-react";

export type ColumnType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "datetime"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person";

const ICONS: Record<ColumnType, LucideIcon> = {
  text: Type,
  number: Hash,
  select: ChevronsUpDown,
  multi_select: ListChecks,
  date: Calendar,
  datetime: Clock,
  checkbox: CheckSquare,
  url: LinkIcon,
  email: AtSign,
  phone: Phone,
  person: User,
};

export function ColumnTypeIcon({
  type,
  className,
}: {
  type: ColumnType;
  className?: string;
}) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}
