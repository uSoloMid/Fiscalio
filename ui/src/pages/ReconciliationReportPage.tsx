import React, { useState, useEffect, useCallback } from 'react';
import { getPendingReconciliationReport } from '../services';

const fmt = (n: number, currency = 'MXN') =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d.replace(' ', 'T'));
    return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface CfdiRow {
    id: number; uuid: string; serie?: string; folio?: string;
    fecha: string; rfc_emisor: string; rfc_receptor: string;
    name_emisor: string; name_receptor: string;
    total: number; tipo: string; metodo_pago?: string; moneda?: string; concepto?: string;
    // PPD extra
    saldo_insoluto?: number; ultimo_pago_fecha?: string; num_parcialidades?: number;
}

interface MovRow {
    id: number; bank_statement_id: number; date: string;
    description: string; reference?: string; cargo: number; abono: number;
    confidence?: string;
    statement?: { id: number; bank_name: string; period?: string; account_number?: string };
}

interface ReportData {
    rfc: string; has_statements: boolean; statements_count: number;
    filters: { from: string | null; to: string | null };
    movimientos_sin_conciliar: {
        ingresos: MovRow[]; egresos: MovRow[];
        total_ingresos: number; total_egresos: number; count: number;
    };
    pue_sin_banco: {
        por_cobrar: CfdiRow[]; por_pagar: CfdiRow[]; nominas: CfdiRow[];
        total_por_cobrar: number; total_por_pagar: number; total_nominas: number; count: number;
    };
    ppd_sin_rep: {
        por_cobrar: CfdiRow[]; por_pagar: CfdiRow[];
        total_por_cobrar: number; total_por_pagar: number; count: number;
    };
    ppd_parciales: {
        por_cobrar: CfdiRow[]; por_pagar: CfdiRow[];
        total_saldo_por_cobrar: number; total_saldo_por_pagar: number; count: number;
    };
    rep_sin_banco: {
        emitidos: CfdiRow[]; recibidos: CfdiRow[];
        total_emitidos: number; total_recibidos: number; count: number;
    };
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function SummaryCard({ label, count, amount, color, icon }: {
    label: string; count: number; amount?: number; color: string; icon: string;
}) {
    return (
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${color}`}>
            <div className="flex items-center gap-2 text-sm font-medium opacity-80">
                <span className="material-symbols-outlined text-base">{icon}</span>
                {label}
            </div>
            <div className="text-2xl font-bold">{count}</div>
            {amount !== undefined && (
                <div className="text-xs opacity-70">{fmt(amount)}</div>
            )}
        </div>
    );
}

function SectionHeader({ title, count, total, expanded, onToggle, color = 'text-gray-800' }: {
    title: string; count: number; total?: number; expanded: boolean;
    onToggle: () => void; color?: string;
}) {
    return (
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
            <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined text-lg ${expanded ? 'text-gray-700' : 'text-gray-400'}`}>
                    {expanded ? 'expand_less' : 'expand_more'}
                </span>
                <span className={`font-semibold text-sm ${color}`}>{title}</span>
                {count > 0 && (
                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {count}
                    </span>
                )}
            </div>
            {total !== undefined && total > 0 && (
                <span className="text-sm font-semibold text-gray-700">{fmt(total)}</span>
            )}
            {count === 0 && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Al corriente
                </span>
            )}
        </button>
    );
}

function SubSection({ title, rows, columns, color = 'text-gray-600' }: {
    title: string; rows: any[]; columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
    color?: string;
}) {
    if (!rows.length) return null;
    return (
        <div className="mt-3">
            <div className={`text-xs font-bold uppercase tracking-widest mb-2 px-1 ${color}`}>{title}</div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            {columns.map(col => (
                                <th key={col.key} className="text-left px-3 py-2 text-gray-500 font-semibold whitespace-nowrap">
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={row.id ?? i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                {columns.map(col => (
                                    <td key={col.key} className="px-3 py-2 text-gray-700">
                                        {col.render ? col.render(row) : row[col.key] ?? '—'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Columns para CFDIs
function cfdiColumns(rfc: string, showSaldo = false) {
    const base = [
        {
            key: 'fecha', label: 'Fecha',
            render: (r: CfdiRow) => <span className="whitespace-nowrap">{fmtDate(r.fecha)}</span>,
        },
        {
            key: 'rfc', label: 'RFC / Nombre',
            render: (r: CfdiRow) => {
                const isEmisor = r.rfc_emisor === rfc;
                const counterRfc  = isEmisor ? r.rfc_receptor : r.rfc_emisor;
                const counterName = isEmisor ? r.name_receptor : r.name_emisor;
                return (
                    <div className="max-w-[200px]">
                        <div className="font-mono text-gray-500">{counterRfc}</div>
                        <div className="truncate text-gray-800" title={counterName}>{counterName || '—'}</div>
                    </div>
                );
            },
        },
        {
            key: 'concepto', label: 'Concepto',
            render: (r: CfdiRow) => (
                <div className="max-w-[220px] truncate text-gray-600" title={r.concepto ?? ''}>
                    {r.concepto || '—'}
                </div>
            ),
        },
        {
            key: 'total', label: 'Total',
            render: (r: CfdiRow) => (
                <span className="font-semibold whitespace-nowrap">
                    {fmt(r.total, r.moneda || 'MXN')}
                    {r.moneda && r.moneda !== 'MXN' && (
                        <span className="ml-1 text-gray-400 font-normal">{r.moneda}</span>
                    )}
                </span>
            ),
        },
    ];

    if (showSaldo) {
        base.push({
            key: 'saldo_insoluto', label: 'Saldo pendiente',
            render: (r: CfdiRow) => (
                <span className="font-semibold text-orange-600 whitespace-nowrap">
                    {r.saldo_insoluto !== undefined ? fmt(r.saldo_insoluto) : '—'}
                </span>
            ),
        });
        base.push({
            key: 'num_parcialidades', label: 'Parcialidades',
            render: (r: CfdiRow) => <span>{r.num_parcialidades ?? 0} pagada(s)</span>,
        });
        base.push({
            key: 'ultimo_pago_fecha', label: 'Último pago',
            render: (r: CfdiRow) => <span className="whitespace-nowrap">{r.ultimo_pago_fecha ? fmtDate(r.ultimo_pago_fecha) : '—'}</span>,
        });
    }

    return base;
}

// Columns para movimientos bancarios
const movColumns = [
    {
        key: 'date', label: 'Fecha',
        render: (r: MovRow) => <span className="whitespace-nowrap">{fmtDate(r.date)}</span>,
    },
    {
        key: 'statement', label: 'Banco / Período',
        render: (r: MovRow) => (
            <div>
                <div className="font-medium text-gray-700">{r.statement?.bank_name ?? '—'}</div>
                <div className="text-gray-400">{r.statement?.period ?? ''}</div>
            </div>
        ),
    },
    {
        key: 'description', label: 'Descripción',
        render: (r: MovRow) => (
            <div className="max-w-[260px] truncate" title={r.description}>{r.description}</div>
        ),
    },
    {
        key: 'reference', label: 'Ref',
        render: (r: MovRow) => <span className="text-gray-400">{r.reference ?? '—'}</span>,
    },
    {
        key: 'importe', label: 'Importe',
        render: (r: MovRow) => r.abono > 0
            ? <span className="text-emerald-600 font-semibold">+{fmt(r.abono)}</span>
            : <span className="text-red-500 font-semibold">-{fmt(r.cargo)}</span>,
    },
    {
        key: 'confidence', label: 'Estado',
        render: (r: MovRow) => {
            const map: Record<string, { label: string; cls: string }> = {
                green:  { label: 'Sugerido',   cls: 'bg-emerald-50 text-emerald-700' },
                yellow: { label: 'Probable',   cls: 'bg-yellow-50 text-yellow-700' },
                red:    { label: 'Sin match',  cls: 'bg-red-50 text-red-600' },
                black:  { label: 'Sin CFDI',   cls: 'bg-gray-100 text-gray-500' },
            };
            if (!r.confidence) return <span className="text-gray-300">—</span>;
            const s = map[r.confidence] ?? { label: r.confidence, cls: 'bg-gray-100 text-gray-500' };
            return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
        },
    },
];

// ── Página principal ──────────────────────────────────────────────────────────

export const ReconciliationReportPage = ({
    activeRfc, clientName, onBack,
}: {
    activeRfc: string; clientName: string; onBack: () => void;
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const [data, setData]       = useState<ReportData | null>(null);
    const [from, setFrom]       = useState('');
    const [to, setTo]           = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');

    const handleMonthChange = (val: string) => {
        setSelectedMonth(val);
        if (val) {
            const [y, m] = val.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            setFrom(`${val}-01`);
            setTo(`${val}-${String(lastDay).padStart(2, '0')}`);
        } else {
            setFrom('');
            setTo('');
        }
    };

    // Secciones abiertas/cerradas
    const [open, setOpen] = useState<Record<string, boolean>>({
        movimientos: true, pue: true, ppdSinRep: true, ppdParcial: true, rep: true,
    });
    const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getPendingReconciliationReport(activeRfc, from || undefined, to || undefined);
            setData(result);
        } catch (e: any) {
            setError(e.message ?? 'Error al cargar el reporte');
        } finally {
            setLoading(false);
        }
    }, [activeRfc, from, to]);

    useEffect(() => { load(); }, [activeRfc]);

    const totalPendingItems = data
        ? data.movimientos_sin_conciliar.count
          + data.pue_sin_banco.count
          + data.ppd_sin_rep.count
          + data.ppd_parciales.count
          + data.rep_sin_banco.count
        : 0;

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <span className="material-symbols-outlined text-xl">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-base font-bold text-gray-900">Reporte de Pendientes</h1>
                        <p className="text-xs text-gray-500">{clientName || activeRfc}</p>
                    </div>
                </div>

                {/* Filtros de fecha + botón cargar */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Selector rápido por mes */}
                    <input
                        type="month" value={selectedMonth}
                        onChange={e => handleMonthChange(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 font-medium"
                        title="Selecciona un mes para rellenar el rango automáticamente"
                    />
                    {/* Separador */}
                    <span className="text-gray-300 text-sm">|</span>
                    {/* Rango específico editable */}
                    <label className="text-xs text-gray-400">Desde</label>
                    <input
                        type="date" value={from}
                        onChange={e => { setFrom(e.target.value); setSelectedMonth(''); }}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                    <label className="text-xs text-gray-400">Hasta</label>
                    <input
                        type="date" value={to}
                        onChange={e => { setTo(e.target.value); setSelectedMonth(''); }}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">{loading ? 'hourglass_empty' : 'refresh'}</span>
                        {loading ? 'Cargando…' : 'Actualizar'}
                    </button>
                </div>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">

                    {/* Alerta sin estados de cuenta */}
                    {data && !data.has_statements && (
                        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
                            <span className="material-symbols-outlined text-yellow-500 text-base mt-0.5">warning</span>
                            <span>
                                No hay estados de cuenta bancarios cargados para este RFC.
                                Las secciones de "sin banco" mostrarán todos los CFDIs pendientes,
                                pero no se puede saber cuáles ya fueron cobrados/pagados fuera del sistema.
                            </span>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                            <span className="material-symbols-outlined text-red-400">error</span>
                            {error}
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {loading && !data && (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-14 bg-gray-200 animate-pulse rounded-xl" />
                            ))}
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Resumen general */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                <SummaryCard
                                    label="Movimientos sin CFDI"
                                    count={data.movimientos_sin_conciliar.count}
                                    amount={data.movimientos_sin_conciliar.total_ingresos + data.movimientos_sin_conciliar.total_egresos}
                                    color="bg-slate-50 border-slate-200 text-slate-700"
                                    icon="account_balance"
                                />
                                <SummaryCard
                                    label="PUE sin banco"
                                    count={data.pue_sin_banco.count}
                                    amount={data.pue_sin_banco.total_por_cobrar + data.pue_sin_banco.total_por_pagar + data.pue_sin_banco.total_nominas}
                                    color="bg-blue-50 border-blue-200 text-blue-700"
                                    icon="receipt"
                                />
                                <SummaryCard
                                    label="PPD sin REP"
                                    count={data.ppd_sin_rep.count}
                                    amount={data.ppd_sin_rep.total_por_cobrar + data.ppd_sin_rep.total_por_pagar}
                                    color="bg-orange-50 border-orange-200 text-orange-700"
                                    icon="description"
                                />
                                <SummaryCard
                                    label="PPD saldo pendiente"
                                    count={data.ppd_parciales.count}
                                    amount={data.ppd_parciales.total_saldo_por_cobrar + data.ppd_parciales.total_saldo_por_pagar}
                                    color="bg-amber-50 border-amber-200 text-amber-700"
                                    icon="pending_actions"
                                />
                                <SummaryCard
                                    label="REP sin banco"
                                    count={data.rep_sin_banco.count}
                                    amount={data.rep_sin_banco.total_emitidos + data.rep_sin_banco.total_recibidos}
                                    color="bg-purple-50 border-purple-200 text-purple-700"
                                    icon="payments"
                                />
                            </div>

                            {totalPendingItems === 0 && (
                                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                                    <span className="material-symbols-outlined text-5xl text-emerald-400">task_alt</span>
                                    <p className="text-base font-semibold text-emerald-600">¡Todo conciliado!</p>
                                    <p className="text-sm">No hay elementos pendientes para el período seleccionado.</p>
                                </div>
                            )}

                            {/* ── Sección 1: Movimientos sin conciliar ─────── */}
                            <div className="flex flex-col gap-2">
                                <SectionHeader
                                    title="Movimientos bancarios sin CFDI"
                                    count={data.movimientos_sin_conciliar.count}
                                    total={data.movimientos_sin_conciliar.total_ingresos + data.movimientos_sin_conciliar.total_egresos}
                                    expanded={open.movimientos}
                                    onToggle={() => toggle('movimientos')}
                                    color="text-slate-700"
                                />
                                {open.movimientos && (
                                    <div className="px-1">
                                        <SubSection
                                            title={`Abonos sin CFDI (${data.movimientos_sin_conciliar.ingresos.length}) — ${fmt(data.movimientos_sin_conciliar.total_ingresos)}`}
                                            rows={data.movimientos_sin_conciliar.ingresos}
                                            columns={movColumns}
                                            color="text-emerald-600"
                                        />
                                        <SubSection
                                            title={`Cargos sin CFDI (${data.movimientos_sin_conciliar.egresos.length}) — ${fmt(data.movimientos_sin_conciliar.total_egresos)}`}
                                            rows={data.movimientos_sin_conciliar.egresos}
                                            columns={movColumns}
                                            color="text-red-600"
                                        />
                                        {data.movimientos_sin_conciliar.count === 0 && (
                                            <p className="text-xs text-gray-400 px-1 py-3 text-center">Sin movimientos sin conciliar.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Sección 2: PUE sin banco ─────────────────── */}
                            <div className="flex flex-col gap-2">
                                <SectionHeader
                                    title="Facturas PUE sin movimiento bancario"
                                    count={data.pue_sin_banco.count}
                                    total={data.pue_sin_banco.total_por_cobrar + data.pue_sin_banco.total_por_pagar + data.pue_sin_banco.total_nominas}
                                    expanded={open.pue}
                                    onToggle={() => toggle('pue')}
                                    color="text-blue-700"
                                />
                                {open.pue && (
                                    <div className="px-1">
                                        <SubSection
                                            title={`Por cobrar — emitidas (${data.pue_sin_banco.por_cobrar.length}) — ${fmt(data.pue_sin_banco.total_por_cobrar)}`}
                                            rows={data.pue_sin_banco.por_cobrar}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-emerald-600"
                                        />
                                        <SubSection
                                            title={`Por pagar — recibidas (${data.pue_sin_banco.por_pagar.length}) — ${fmt(data.pue_sin_banco.total_por_pagar)}`}
                                            rows={data.pue_sin_banco.por_pagar}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-red-600"
                                        />
                                        <SubSection
                                            title={`Nóminas sin banco (${data.pue_sin_banco.nominas.length}) — ${fmt(data.pue_sin_banco.total_nominas)}`}
                                            rows={data.pue_sin_banco.nominas}
                                            columns={[
                                                { key: 'fecha', label: 'Fecha', render: (r: CfdiRow) => <span className="whitespace-nowrap">{fmtDate(r.fecha)}</span> },
                                                { key: 'name_receptor', label: 'Empleado', render: (r: CfdiRow) => <span>{r.name_receptor || r.rfc_receptor}</span> },
                                                { key: 'concepto', label: 'Concepto', render: (r: CfdiRow) => <div className="max-w-[200px] truncate text-gray-600">{r.concepto || '—'}</div> },
                                                { key: 'total', label: 'Total', render: (r: CfdiRow) => <span className="font-semibold">{fmt(r.total)}</span> },
                                            ]}
                                            color="text-orange-600"
                                        />
                                        {data.pue_sin_banco.count === 0 && (
                                            <p className="text-xs text-gray-400 px-1 py-3 text-center">Sin facturas PUE pendientes.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Sección 3: PPD sin REP ─────────────────── */}
                            <div className="flex flex-col gap-2">
                                <SectionHeader
                                    title="Facturas PPD sin complemento de pago (REP)"
                                    count={data.ppd_sin_rep.count}
                                    total={data.ppd_sin_rep.total_por_cobrar + data.ppd_sin_rep.total_por_pagar}
                                    expanded={open.ppdSinRep}
                                    onToggle={() => toggle('ppdSinRep')}
                                    color="text-orange-700"
                                />
                                {open.ppdSinRep && (
                                    <div className="px-1">
                                        <SubSection
                                            title={`Por cobrar — emitidas (${data.ppd_sin_rep.por_cobrar.length}) — ${fmt(data.ppd_sin_rep.total_por_cobrar)}`}
                                            rows={data.ppd_sin_rep.por_cobrar}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-emerald-600"
                                        />
                                        <SubSection
                                            title={`Por pagar — recibidas (${data.ppd_sin_rep.por_pagar.length}) — ${fmt(data.ppd_sin_rep.total_por_pagar)}`}
                                            rows={data.ppd_sin_rep.por_pagar}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-red-600"
                                        />
                                        {data.ppd_sin_rep.count === 0 && (
                                            <p className="text-xs text-gray-400 px-1 py-3 text-center">Sin facturas PPD sin REP.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Sección 4: PPD parcialmente pagados ──────── */}
                            <div className="flex flex-col gap-2">
                                <SectionHeader
                                    title="Facturas PPD con saldo pendiente"
                                    count={data.ppd_parciales.count}
                                    total={data.ppd_parciales.total_saldo_por_cobrar + data.ppd_parciales.total_saldo_por_pagar}
                                    expanded={open.ppdParcial}
                                    onToggle={() => toggle('ppdParcial')}
                                    color="text-amber-700"
                                />
                                {open.ppdParcial && (
                                    <div className="px-1">
                                        <SubSection
                                            title={`Por cobrar (${data.ppd_parciales.por_cobrar.length}) — Saldo: ${fmt(data.ppd_parciales.total_saldo_por_cobrar)}`}
                                            rows={data.ppd_parciales.por_cobrar}
                                            columns={cfdiColumns(activeRfc, true)}
                                            color="text-emerald-600"
                                        />
                                        <SubSection
                                            title={`Por pagar (${data.ppd_parciales.por_pagar.length}) — Saldo: ${fmt(data.ppd_parciales.total_saldo_por_pagar)}`}
                                            rows={data.ppd_parciales.por_pagar}
                                            columns={cfdiColumns(activeRfc, true)}
                                            color="text-red-600"
                                        />
                                        {data.ppd_parciales.count === 0 && (
                                            <p className="text-xs text-gray-400 px-1 py-3 text-center">Sin saldos pendientes en facturas PPD.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Sección 5: REP sin banco ─────────────────── */}
                            <div className="flex flex-col gap-2">
                                <SectionHeader
                                    title="Complementos de pago (REP) sin movimiento bancario"
                                    count={data.rep_sin_banco.count}
                                    total={data.rep_sin_banco.total_emitidos + data.rep_sin_banco.total_recibidos}
                                    expanded={open.rep}
                                    onToggle={() => toggle('rep')}
                                    color="text-purple-700"
                                />
                                {open.rep && (
                                    <div className="px-1">
                                        <SubSection
                                            title={`Emitidos (${data.rep_sin_banco.emitidos.length}) — ${fmt(data.rep_sin_banco.total_emitidos)}`}
                                            rows={data.rep_sin_banco.emitidos}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-emerald-600"
                                        />
                                        <SubSection
                                            title={`Recibidos (${data.rep_sin_banco.recibidos.length}) — ${fmt(data.rep_sin_banco.total_recibidos)}`}
                                            rows={data.rep_sin_banco.recibidos}
                                            columns={cfdiColumns(activeRfc)}
                                            color="text-purple-600"
                                        />
                                        {data.rep_sin_banco.count === 0 && (
                                            <p className="text-xs text-gray-400 px-1 py-3 text-center">Todos los REP están conciliados.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
