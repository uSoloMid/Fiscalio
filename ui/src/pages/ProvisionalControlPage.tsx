import { useEffect, useState } from 'react';
import {
    getProvisionalSummary,
    getBucketDetails,
    updateDeductibility,
    exportDetailedBucketPdf,
    exportCfdiPdf
} from '../services';
import { PpdExplorer, RepExplorer } from './ProvisionalExplorers';

interface TaxBreakdown {
    pue: number;
    ppd: number;
    rep: number;
    suma_devengado: number;
    suma_efectivo: number;
    pendiente: number;
}

interface SummaryData {
    ingresos: {
        total_efectivo: number;
        subtotal: TaxBreakdown;
        iva: TaxBreakdown;
        retenciones: TaxBreakdown;
        total: TaxBreakdown;
    };
    egresos: {
        total_efectivo: number;
        subtotal: TaxBreakdown;
        iva: TaxBreakdown;
        retenciones: TaxBreakdown;
        total: TaxBreakdown;
    };
    no_deducibles: {
        total_efectivo: number;
        total_pendiente: number;
    };
    alertas: Array<{ type: string, message: string }>;
}

const USO_CFDI: Record<string, string> = {
    'G01': 'Adquisición de mercancías',
    'G02': 'Devoluciones, descuentos o bonificaciones',
    'G03': 'Gastos en general',
    'I01': 'Construcciones',
    'I02': 'Mobiliario y equipo de oficina',
    'I03': 'Equipo de transporte',
    'I04': 'Equipo de computo',
    'I05': 'Dados, troqueles, moldes',
    'I06': 'Comunicaciones telefónicas',
    'I07': 'Comunicaciones satelitales',
    'I08': 'Otra maquinaria y equipo',
    'D01': 'Honorarios médicos/dentales',
    'D02': 'Gastos médicos incapacidad',
    'D03': 'Gastos funerales',
    'D04': 'Donativos',
    'D05': 'Intereses hipotecarios',
    'D06': 'Aportaciones SAR',
    'D07': 'Primas seguros médicos',
    'D08': 'Gastos transporte escolar',
    'D09': 'Depósitos cuentas ahorro',
    'D10': 'Colegiaturas',
    'S01': 'Sin efectos fiscales',
    'CP01': 'Pagos'
};

const FORMA_PAGO: Record<string, string> = {
    '01': 'Efectivo',
    '02': 'Cheque nominativo',
    '03': 'Transferencia (SPEI)',
    '04': 'Tarjeta de crédito',
    '05': 'Monedero electrónico',
    '06': 'Dinero electrónico',
    '08': 'Vales de despensa',
    '12': 'Dación en pago',
    '28': 'Tarjeta de débito',
    '29': 'Tarjeta de servicios',
    '99': 'Por definir'
};

export function ProvisionalControlPage({ activeRfc, clientName, onBack, initialYear, initialMonth, onPeriodChange }: {
    activeRfc: string,
    clientName: string,
    onBack: () => void,
    initialYear: number,
    initialMonth: number,
    onPeriodChange: (year: number, month: number) => void
}) {
    const [view, setView] = useState<'summary' | 'ppd_issued' | 'ppd_received' | 'rep_issued' | 'rep_received'>('summary');
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState({
        year: initialYear,
        month: initialMonth
    });

    // Bucket Details State
    const [detailBucket, setDetailBucket] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [expandedCard, setExpandedCard] = useState<string | null>(null);

    const [updatingUuid, setUpdatingUuid] = useState<string | null>(null);

    useEffect(() => {
        setPeriod({ year: initialYear, month: initialMonth });
    }, [initialYear, initialMonth]);

    const fetchSummary = async () => {
        try {
            setLoading(true);
            const data = await getProvisionalSummary(activeRfc, period.year, period.month);
            setSummary(data);
        } catch (error) {
            console.error('Error fetching provisional summary', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeRfc) {
            fetchSummary();
        }
    }, [activeRfc, period]);

    const loadBucketDetail = async (bucket: string) => {
        setDetailBucket(bucket);
        setDetailLoading(true);
        setExpandedCard(null);
        try {
            const data = await getBucketDetails({
                rfc: activeRfc,
                year: period.year,
                month: period.month,
                bucket
            });
            setDetailData(data);
        } catch (error) {
            console.error("Error loading bucket details", error);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleToggleDeductible = async (item: any) => {
        setUpdatingUuid(item.uuid);
        try {
            await updateDeductibility(item.uuid, {
                is_deductible: !item.is_deductible
            });
            // Update local state for immediate feedback
            setDetailData(prev => prev.map(i => i.uuid === item.uuid ? { ...i, is_deductible: !i.is_deductible } : i));
            // Refresh summary
            fetchSummary();
        } catch (error) {
            console.error("Error updating deductibility", error);
        } finally {
            setUpdatingUuid(null);
        }
    };

    const handleDownloadPdf = () => {
        if (!detailBucket) return;
        exportDetailedBucketPdf({
            rfc: activeRfc,
            year: period.year,
            month: period.month,
            bucket: detailBucket
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    if (view === 'ppd_issued') return <PpdExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'ppd_received') return <PpdExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;
    if (view === 'rep_issued') return <RepExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'rep_received') return <RepExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;

    const TableRow = ({ label, data, bucketPrefix, isMain = false }: { label: string, data: TaxBreakdown | undefined, bucketPrefix: string, isMain?: boolean }) => {
        if (!data) return null;
        if (label.includes("Retenciones") && data.pue === 0 && data.ppd === 0 && data.rep === 0) return null;

        return (
            <tr className={`group transition-colors ${isMain ? 'bg-gray-50/50' : 'hover:bg-gray-50'}`}>
                <td className="py-5 px-8">
                    <div className={`text-sm ${isMain ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>{label}</div>
                </td>
                <td className="py-5 px-8 text-right">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_pue`)} className="text-sm font-semibold text-gray-700 hover:text-emerald-600 transition-colors">
                        {formatCurrency(data.pue)}
                    </button>
                </td>
                <td className="py-5 px-8 text-right">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_ppd`)} className="text-sm font-semibold text-gray-400 hover:text-emerald-600 transition-colors">
                        {formatCurrency(data.ppd)}
                    </button>
                </td>
                <td className="py-5 px-8 text-right">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_rep`)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                        {formatCurrency(data.rep)}
                    </button>
                </td>
                <td className="py-5 px-8 text-right">
                    <div className="text-sm font-black text-emerald-600">
                        {formatCurrency(data.suma_efectivo)}
                    </div>
                </td>
                <td className="py-5 px-8 text-right">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_pendiente`)} className="text-sm font-semibold text-orange-500 hover:text-orange-700 transition-colors">
                        {formatCurrency(data.pendiente)}
                    </button>
                </td>
            </tr>
        );
    };

    return (
        <div className="h-full bg-gray-50 flex flex-col font-['Inter'] relative overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 flex-shrink-0 z-10 py-3 md:py-0">
                <div className="h-auto md:h-20 flex flex-col md:flex-row items-center justify-between px-4 md:px-10 gap-4 md:gap-0">
                    <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                        <button onClick={onBack} className="p-2 md:p-3 hover:bg-gray-50 rounded-2xl transition-all group flex-shrink-0">
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="min-w-0">
                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-0.5">Control Fiscal</div>
                            <h1 className="text-base md:text-xl font-black text-gray-900 tracking-tight flex items-center gap-1 flex-wrap">
                                <span>Provisional</span>
                                <span className="text-gray-300 hidden sm:inline">/</span>
                                <span className="text-gray-500 truncate">{clientName}</span>
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-end">
                        <select
                            value={period.month}
                            onChange={(e) => {
                                const m = parseInt(e.target.value);
                                setPeriod({ ...period, month: m });
                                onPeriodChange(period.year, m);
                            }}
                            className="flex-1 md:flex-none bg-gray-50 border-none rounded-xl px-3 md:px-4 py-2 text-xs md:text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <select
                            value={period.year}
                            onChange={(e) => {
                                const y = parseInt(e.target.value);
                                setPeriod({ ...period, year: y });
                                onPeriodChange(y, period.month);
                            }}
                            className="flex-1 md:flex-none bg-gray-50 border-none rounded-xl px-3 md:px-4 py-2 text-xs md:text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-6 lg:p-10 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1600px] mx-auto space-y-10 lg:space-y-16">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-6">
                            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">Calculando balances...</div>
                        </div>
                    ) : (
                        <>
                            {/* Ingresos Section */}
                            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <div className="bg-white rounded-[40px] p-1 shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 lg:px-10 py-8 bg-emerald-600">
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-1 truncate">Ingresos Efectivizados (Cobro Real)</div>
                                                <div className="text-4xl lg:text-5xl font-black text-white tracking-tighter truncate">
                                                    {formatCurrency(summary?.ingresos.total_efectivo || 0)}
                                                    <span className="text-lg text-emerald-100/50 ml-2 font-medium tracking-normal">MXN</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 lg:gap-4 w-full lg:w-auto">
                                                <button onClick={() => setView('ppd_issued')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador PPD</button>
                                                <button onClick={() => setView('rep_issued')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador REP</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[1000px]">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto (Ingresos)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">PUE (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">PPD (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right">REP (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">Suma Efectivo (Cobrado)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-orange-500 uppercase tracking-widest text-right">Pendiente Final</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {summary && (
                                                    <>
                                                        <TableRow label="Base Gravable (Subtotal)" data={summary.ingresos.subtotal} bucketPrefix="ingresos_subtotal" />
                                                        <TableRow label="IVA Facturado" data={summary.ingresos.iva} bucketPrefix="ingresos_iva" />
                                                        <TableRow label="Retenciones" data={summary.ingresos.retenciones} bucketPrefix="ingresos_retenciones" />
                                                        <TableRow label="Total Facturado" data={summary.ingresos.total} bucketPrefix="ingresos_total" isMain />
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>

                            {/* Egresos Section */}
                            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 relative">
                                <div className="bg-white rounded-[40px] p-1 shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 lg:px-10 py-8 bg-blue-600 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-1 truncate">Egresos Efectivizados (Deducciones Reales)</div>
                                            <div className="flex items-baseline gap-4">
                                                <div className="text-4xl lg:text-5xl font-black text-white tracking-tighter truncate">
                                                    {formatCurrency(summary?.egresos.total_efectivo || 0)}
                                                    <span className="text-lg text-blue-100/50 ml-2 font-medium tracking-normal">MXN</span>
                                                </div>
                                                {summary && summary.no_deducibles?.total_efectivo > 0 && (
                                                    <div className="bg-yellow-400/20 border border-yellow-400/30 px-3 py-1 rounded-full text-yellow-300 text-[10px] font-black uppercase tracking-widest">
                                                        Excluidos: {formatCurrency(summary.no_deducibles.total_efectivo)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 lg:gap-4 w-full lg:w-auto">
                                            <button onClick={() => setView('ppd_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador PPD</button>
                                            <button onClick={() => setView('rep_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador REP</button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[1000px]">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto (Egresos)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">PUE (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">PPD (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-blue-500 uppercase tracking-widest text-right">REP (Mes)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">Suma Efectivo (Deducible)</th>
                                                    <th className="py-6 px-8 text-[10px] font-black text-orange-500 uppercase tracking-widest text-right">Pendiente Final</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {summary && (
                                                    <>
                                                        <TableRow label="Base Deducible (Subtotal)" data={summary.egresos.subtotal} bucketPrefix="egresos_subtotal" />
                                                        <TableRow label="IVA Acreditable (Facturado)" data={summary.egresos.iva} bucketPrefix="egresos_iva" />
                                                        <TableRow label="Retenciones" data={summary.egresos.retenciones} bucketPrefix="egresos_retenciones" />
                                                        <TableRow label="Total Facturado" data={summary.egresos.total} bucketPrefix="egresos_total" isMain />
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* No Deducibles Summary Row */}
                                    {summary && summary.no_deducibles?.total_efectivo > 0 && (
                                        <div className="bg-orange-50/50 px-8 py-4 border-t border-orange-100 flex justify-between items-center">
                                            <div className="text-[10px] font-black text-orange-600 uppercase tracking-widest">⚠️ Comprobantes marcados como No Deducibles o Personales</div>
                                            <div className="flex gap-8 text-right">
                                                <div>
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Total Excluido (Pagado)</div>
                                                    <div className="text-sm font-black text-orange-600">{formatCurrency(summary.no_deducibles.total_efectivo)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Total Pendiente (Excluido)</div>
                                                    <div className="text-sm font-black text-gray-500">{formatCurrency(summary.no_deducibles.total_pendiente)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </main>

            {/* Sidebar Details Drawer */}
            {detailBucket && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setDetailBucket(null)}></div>
                    <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Desglose Detallado</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{detailBucket.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleDownloadPdf}
                                    title="Descargar PDF Detallado"
                                    className="p-3 hover:bg-emerald-50 text-emerald-600 rounded-2xl transition-all group border border-emerald-100"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </button>
                                <button onClick={() => setDetailBucket(null)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all group">
                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-50/50">
                            {detailLoading ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4">
                                    <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cargando CFDIs...</div>
                                </div>
                            ) : detailData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
                                        <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No se encontraron comprobantes para este rubro.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {detailData.map((item, idx) => {
                                        const isExpanded = expandedCard === item.uuid;
                                        return (
                                            <div
                                                key={item.uuid}
                                                onClick={() => setExpandedCard(isExpanded ? null : item.uuid)}
                                                className={`p-5 bg-white transition-all border rounded-[24px] cursor-pointer group relative overflow-hidden ${!item.is_deductible ? 'border-orange-200 bg-orange-50/20 opacity-80' : 'border-transparent hover:shadow-xl hover:border-emerald-100 shadow-sm'} `}
                                            >
                                                {!item.is_deductible && (
                                                    <div className="absolute top-0 right-10 bg-orange-500 text-white text-[8px] font-black uppercase px-2 py-1 rounded-b-lg">No Deducible</div>
                                                )}

                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="min-w-0 flex-1 pr-4">
                                                        <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">{item.uuid}</div>
                                                        <div className="text-sm font-black text-gray-900 leading-tight group-hover:text-emerald-600 transition-colors uppercase">{item.nombre}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-base font-black text-gray-900">{formatCurrency(item.total)}</div>
                                                        <div className="text-[10px] font-bold text-gray-400 mt-0.5">{item.fecha}</div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-3 mt-3">
                                                    <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100/50">
                                                        <span className="font-bold text-gray-400 text-[8px] uppercase tracking-tighter block mb-0.5">Subtotal</span>
                                                        <span className="font-black text-gray-700 text-xs">{formatCurrency(item.subtotal)}</span>
                                                    </div>
                                                    <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100/50">
                                                        <span className="font-bold text-gray-400 text-[8px] uppercase tracking-tighter block mb-0.5">IVA</span>
                                                        <span className="font-black text-gray-700 text-xs">{formatCurrency(item.iva)}</span>
                                                    </div>

                                                    {isExpanded && (
                                                        <>
                                                            <div className="w-full h-px bg-gray-50 my-1"></div>
                                                            <div className="flex flex-wrap gap-4 w-full">
                                                                <div className="flex-1">
                                                                    <span className="font-bold text-gray-400 text-[8px] uppercase tracking-tighter block mb-1">Método de Pago</span>
                                                                    <div className="text-[10px] font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded-lg inline-block uppercase">
                                                                        {item.metodo_pago === 'PUE' ? 'PUE - Una sola exhibición' : 'PPD - Diferido / Parcialidades'}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <span className="font-bold text-gray-400 text-[8px] uppercase tracking-tighter block mb-1">Uso de CFDI</span>
                                                                    <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg inline-block uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={USO_CFDI[item.uso_cfdi] || item.uso_cfdi}>
                                                                        {item.uso_cfdi} - {USO_CFDI[item.uso_cfdi] || 'No especificado'}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <span className="font-bold text-gray-400 text-[8px] uppercase tracking-tighter block mb-1">Forma de Pago</span>
                                                                    <div className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg inline-block uppercase">
                                                                        {item.forma_pago} - {FORMA_PAGO[item.forma_pago] || 'Otros / Por definir'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="mt-4 flex justify-between items-center gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleDeductible(item); }}
                                                            disabled={updatingUuid === item.uuid}
                                                            className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border transition-all ${item.is_deductible
                                                                ? 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white'
                                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'
                                                                }`}
                                                        >
                                                            {updatingUuid === item.uuid ? 'Procesando...' : (item.is_deductible ? 'Marcar No Deducible' : 'Hacer Deducible')}
                                                        </button>

                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); exportCfdiPdf(item.uuid); }}
                                                            className="flex items-center gap-2 bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100 px-4 py-2 rounded-xl transition-all"
                                                            title="Descargar PDF Individual"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Descargar PDF</span>
                                                        </button>
                                                    </div>
                                                    <svg className={`w-4 h-4 text-gray-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer Totals */}
                        {!detailLoading && detailData.length > 0 && (
                            <div className="p-8 bg-gray-900 text-white rounded-t-[40px] shadow-[0_-20px_40px_rgba(0,0,0,0.2)]">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Balances de Selección</div>
                                    <div className="text-[10px] font-bold text-gray-600 bg-gray-800 px-3 py-1 rounded-full">{detailData.length} Comprobantes</div>
                                </div>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="opacity-80">
                                        <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Deducible Subtotal</div>
                                        <div className="text-lg font-black tracking-tight">{formatCurrency(detailData.filter(i => i.is_deductible).reduce((acc, curr) => acc + (curr.subtotal || 0), 0))}</div>
                                    </div>
                                    <div className="opacity-80">
                                        <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Excluido total</div>
                                        <div className="text-lg font-black tracking-tight text-orange-400">{formatCurrency(detailData.filter(i => !i.is_deductible).reduce((acc, curr) => acc + (curr.total || 0), 0))}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">Neto a Sumar (MXN)</div>
                                        <div className="text-2xl font-black tracking-tighter text-emerald-400">{formatCurrency(detailData.filter(i => i.is_deductible).reduce((acc, curr) => acc + (curr.total || 0), 0))}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
