/**
 * MonthYearPicker — selector unificado de mes/año para todos los módulos.
 * Cada página construye sus propias opciones (value + label) y las pasa como props.
 */

export interface PickerOption {
    value: string;
    label: string;
}

/** Nombres completos de meses en español (índice 0 = Enero) */
export const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Mapeo de mes cero-relleno ("01"…"12") a nombre completo */
export const MONTH_NUM_LABELS: Record<string, string> = Object.fromEntries(
    MONTH_NAMES_ES.map((name, i) => [String(i + 1).padStart(2, '0'), name])
);

/** Mapeo de abreviatura SAT ("ENE"…"DIC") a nombre completo */
export const MONTH_ABBR_LABELS: Record<string, string> = {
    ENE: 'Enero',   FEB: 'Febrero', MAR: 'Marzo',    ABR: 'Abril',
    MAY: 'Mayo',    JUN: 'Junio',   JUL: 'Julio',    AGO: 'Agosto',
    SEP: 'Septiembre', OCT: 'Octubre', NOV: 'Noviembre', DIC: 'Diciembre',
};

/** Genera opciones para todos los meses del año (valor = "01"…"12") */
export function allMonthOptions(allowAll?: boolean): PickerOption[] {
    const opts = MONTH_NAMES_ES.map((name, i) => ({
        value: String(i + 1).padStart(2, '0'),
        label: name,
    }));
    return allowAll ? [{ value: 'all', label: 'Mes' }, ...opts] : opts;
}

/** Genera opciones para un rango de años */
export function yearRangeOptions(
    from: number,
    to: number,
    allowAll?: boolean
): PickerOption[] {
    const opts: PickerOption[] = [];
    for (let y = from; y <= to; y++) opts.push({ value: String(y), label: String(y) });
    return allowAll ? [{ value: 'all', label: 'Año' }, ...opts] : opts;
}

// ─── Componente ────────────────────────────────────────────────────────────────

interface Props {
    monthValue: string;
    yearValue: string;
    monthOptions: PickerOption[];
    yearOptions: PickerOption[];
    onMonthChange: (value: string) => void;
    onYearChange: (value: string) => void;
    className?: string;
}

export function MonthYearPicker({
    monthValue,
    yearValue,
    monthOptions,
    yearOptions,
    onMonthChange,
    onYearChange,
    className = '',
}: Props) {
    const selectCls =
        'appearance-none bg-white border border-gray-200 rounded-xl pl-3 pr-7 py-2 ' +
        'text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 ' +
        'focus:ring-emerald-500/30 focus:border-emerald-400 cursor-pointer ' +
        'hover:border-gray-300 transition-colors';

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <span className="material-symbols-outlined text-gray-400 select-none" style={{ fontSize: 18 }}>
                calendar_month
            </span>

            {/* Mes */}
            <div className="relative">
                <select
                    className={selectCls}
                    value={monthValue}
                    onChange={e => onMonthChange(e.target.value)}
                >
                    {monthOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <span
                    className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none select-none"
                    style={{ fontSize: 18 }}
                >
                    expand_more
                </span>
            </div>

            {/* Año */}
            <div className="relative">
                <select
                    className={selectCls}
                    value={yearValue}
                    onChange={e => onYearChange(e.target.value)}
                >
                    {yearOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <span
                    className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none select-none"
                    style={{ fontSize: 18 }}
                >
                    expand_more
                </span>
            </div>
        </div>
    );
}
