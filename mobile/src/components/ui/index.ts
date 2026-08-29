/**
 * TriLearn UI kit.
 *
 * House rules for screens:
 *  - Layout with these primitives; never hand-roll a card, chip or button.
 *  - Colour comes from `useTheme()` tokens, never a raw hex or a Tailwind
 *    palette shade, so light and dark stay in step.
 *  - Every interactive element needs an accessible name and a >= 44pt target;
 *    the primitives here already provide both.
 */

export { Avatar, getInitials } from './Avatar';
export { Badge, type BadgeTone } from './Badge';
export { Button, IconButton, type ButtonProps, type ButtonVariant } from './Button';
export { Card, PressableCard } from './Card';
export { FilterChips } from './FilterChips';
export { Input } from './Input';
export { ListRow } from './ListRow';
export { ProgressBar } from './ProgressBar';
export { QuickLinks, type QuickLink } from './QuickLinks';
export { SCREEN_GUTTER, Screen, ScreenHeader } from './Screen';
export { Select, type SelectOption } from './Select';
export { Divider, Section } from './Section';
export { Sheet } from './Sheet';
export { Skeleton, SkeletonCard, SkeletonList } from './Skeleton';
export { StatTile } from './StatTile';
export { EmptyState, ErrorState, InlineNotice } from './States';
export { Text, type TextTone, type TextVariant } from './Text';
