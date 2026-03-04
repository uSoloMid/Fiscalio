import type { ReconciliationConfidence } from '../models';

const CONFIG: Record<NonNullable<ReconciliationConfidence>, { label: string; bg: string; text: string; dot: string }> = {
    green:  { label: 'AUTO',      bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    yellow: { label: 'REVISAR',   bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500' },
    red:    { label: 'MANUAL',    bg: 'bg-red-100',      text: 'text-red-700',     dot: 'bg-red-500' },
    black:  { label: 'PENDIENTE', bg: 'bg-gray-100',     text: 'text-gray-500',    dot: 'bg-gray-400' },
};

interface Props {
    confidence: ReconciliationConfidence | null | undefined;
    size?: 'sm' | 'xs';
}

export function ConfidenceBadge({ confidence, size = 'xs' }: Props) {
    if (!confidence) return null;
    const cfg = CONFIG[confidence];
    const textSize = size === 'xs' ? 'text-[9px]' : 'text-[11px]';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${textSize} ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}
