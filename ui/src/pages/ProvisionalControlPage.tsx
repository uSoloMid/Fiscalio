import { useEffect, useState } from 'react';
import { getProvisionalSummary, getBucketDetails } from '../services';
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
    alertas: Array<{ type: string, message: string }>;
}

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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    if (view === 'ppd_issued') return <PpdExplorer activeRfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'ppd_received') return <PpdExplorer activeRfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;
    if (view === 'rep_issued') return <RepExplorer activeRfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'rep_received') return <RepExplorer activeRfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;

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
            <header className="bg-white border-b border-gray-100 flex-shrink-0 z-10">
                <div className="h-20 flex items-center justify-between px-10">
                    <div className="flex items-center gap-6">
                        <button onClick={onBack} className="p-3 hover:bg-gray-50 rounded-2xl transition-all group">
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div>
                            <div className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] mb-0.5">Control Fiscal</div>
                            <h1 className="text-xl font-black text-gray-900 tracking-tight">Provisional SAT <span className="text-gray-300 mx-2">/</span> <span className="text-gray-500">{clientName}</span></h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <select
                            value={period.month}
                            onChange={(e) => {
                                const m = parseInt(e.target.value);
                                setPeriod({ ...period, month: m });
                                onPeriodChange(period.year, m);
                            }}
                            className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                            className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                                <div className="bg-white rounded-[40px] p-1 shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 lg:px-10 py-8 bg-blue-600">
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-1 truncate">Egresos Efectivizados (Deducciones Reales)</div>
                                                <div className="text-4xl lg:text-5xl font-black text-white tracking-tighter truncate">
                                                    {formatCurrency(summary?.egresos.total_efectivo || 0)}
                                                    <span className="text-lg text-blue-100/50 ml-2 font-medium tracking-normal">MXN</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 lg:gap-4 w-full lg:w-auto">
                                                <button onClick={() => setView('ppd_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador PPD</button>
                                                <button onClick={() => setView('rep_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap">Explorador REP</button>
                                            </div>
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
                            <button onClick={() => setDetailBucket(null)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all group">
                                <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {detailLoading ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4">
                                    <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cargando CFDIs...</div>
                                </div>
                            ) : detailData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">No se encontraron comprobantes para este rubro.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {detailData.map((item, idx) => (
                                        <div key={idx} className="p-5 bg-gray-50 hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-emerald-100 rounded-[24px] group">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="min-w-0 flex-1 pr-4">
                                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{item.uuid}</div>
                                                    <div className="text-sm font-black text-gray-900 truncate">{item.name_receptor || item.name_emisor}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-black text-gray-900">{formatCurrency(item.total)}</div>
                                                    <div className="text-[10px] font-bold text-gray-400">{new Date(item.fecha).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-4 border-t border-gray-100 pt-3">
                                                <div className="text-[9px]">
                                                    <span className="font-bold text-gray-400 uppercase tracking-tighter block">Subtotal</span>
                                                    <span className="font-black text-gray-700">{formatCurrency(item.subtotal)}</span>
                                                </div>
                                                <div className="text-[9px]">
                                                    <span className="font-bold text-gray-400 uppercase tracking-tighter block">IVA</span>
                                                    <span className="font-black text-gray-700">{formatCurrency(item.iva)}</span>
                                                </div>
                                                {item.retenciones > 0 && (
                                                    <div className="text-[9px]">
                                                        <span className="font-bold text-orange-400 uppercase tracking-tighter block">Ret.</span>
                                                        <span className="font-black text-orange-600">{formatCurrency(item.retenciones)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
