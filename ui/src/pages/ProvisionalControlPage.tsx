import { useEffect, useState } from 'react';
import { getProvisionalSummary } from '../services';
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
        total: TaxBreakdown;
    };
    egresos: {
        total_efectivo: number;
        subtotal: TaxBreakdown;
        iva: TaxBreakdown;
        total: TaxBreakdown;
    };
    alertas: Array<{ type: string, message: string }>;
}

export function ProvisionalControlPage({ activeRfc, clientName, onBack }: { activeRfc: string, clientName: string, onBack: () => void }) {
    const [view, setView] = useState<'summary' | 'ppd_issued' | 'ppd_received' | 'rep_issued' | 'rep_received'>('summary');
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState({
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1
    });

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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    if (loading && !summary) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>;
    }

    const TableRow = ({ label, breakdown, highlight = false, colorClass = "emerald" }: { label: string, breakdown: TaxBreakdown, highlight?: boolean, colorClass?: string }) => (
        <tr className={`border-b border-gray-50 transition-colors hover:bg-gray-50/50 ${highlight ? 'bg-gray-50/30' : ''}`}>
            <td className="py-4 pl-4 pr-3 text-sm font-bold text-gray-900">{label}</td>
            <td className="py-4 px-3 text-sm text-gray-600 text-right">{formatCurrency(breakdown.pue)}</td>
            <td className="py-4 px-3 text-sm text-gray-600 text-right">{formatCurrency(breakdown.ppd)}</td>
            <td className={`py-4 px-3 text-sm font-black text-right ${colorClass === 'emerald' ? 'text-emerald-600' : 'text-blue-600'}`}>{formatCurrency(breakdown.suma_devengado)}</td>
            <td className="py-4 px-3 text-sm font-bold text-amber-600 text-right">{formatCurrency(breakdown.pendiente)}</td>
        </tr>
    );

    const CashRow = ({ label, breakdown, colorClass = "emerald" }: { label: string, breakdown: TaxBreakdown, colorClass?: string }) => (
        <tr className="border-b border-gray-50 bg-emerald-50/10">
            <td className="py-4 pl-4 pr-3 text-sm font-black text-gray-900">{label} (Cobrado)</td>
            <td className="py-4 px-3 text-sm text-gray-600 text-right">{formatCurrency(breakdown.pue)}</td>
            <td className="py-4 px-3 text-sm text-gray-600 text-right">{formatCurrency(breakdown.rep)}</td>
            <td className={`py-4 px-3 text-sm font-black text-right ${colorClass === 'emerald' ? 'text-emerald-700' : 'text-blue-700'}`}>{formatCurrency(breakdown.suma_efectivo)}</td>
            <td className="py-4 px-3 text-sm text-gray-400 text-right">---</td>
        </tr>
    );

    return (
        <div className="h-full bg-gray-50 flex flex-col font-['Inter'] overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 flex-shrink-0">
                <div className="h-20 flex items-center justify-between px-10">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600 transition-all">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{clientName}</h1>
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest leading-none">{activeRfc}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <select
                            value={period.month}
                            onChange={(e) => setPeriod({ ...period, month: parseInt(e.target.value) })}
                            className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <select
                            value={period.year}
                            onChange={(e) => setPeriod({ ...period, year: parseInt(e.target.value) })}
                            className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-6 lg:p-10 overflow-y-auto overflow-x-auto min-h-0 custom-scrollbar">
                <div className="max-w-[1600px] mx-auto space-y-10 pb-10">
                    {/* Title Section */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                        <div>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Control Provisional (SAT)</h2>
                            <p className="text-sm text-gray-500 font-medium mt-1">
                                Análisis de Base ISR e IVA para Declaración Provisional
                            </p>
                        </div>
                        <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Auditoría Activa</span>
                        </div>
                    </div>

                    {view === 'summary' ? (
                        <>
                            {/* Summary Grid */}
                            <div className="grid grid-cols-1 gap-10">
                                {/* Ingresos Section */}
                                <div className="bg-white rounded-[40px] p-1 shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 lg:px-10 py-8 bg-emerald-600">
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-1 truncate">Ingresos Efectivizados (IVA Realizado / Cobro)</div>
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
                                        <div className="p-6 lg:p-10 min-w-[800px]">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                                        <th className="pb-4 pl-4">Concepto (Ingresos)</th>
                                                        <th className="pb-4 px-3 text-right">PUE (Mes)</th>
                                                        <th className="pb-4 px-3 text-right">PPD (Mes)</th>
                                                        <th className="pb-4 px-3 text-right text-emerald-600">Suma Devengado (ISR)</th>
                                                        <th className="pb-4 px-3 text-right text-amber-600">Pendiente Final</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {summary && (
                                                        <>
                                                            <TableRow label="Base ISR (Subtotal)" breakdown={summary.ingresos.subtotal} />
                                                            <TableRow label="IVA Facturado" breakdown={summary.ingresos.iva} />
                                                            <TableRow label="Total Facturado" breakdown={summary.ingresos.total} highlight={true} />
                                                            <tr className="h-8"></tr>
                                                            <CashRow label="IVA Realizado" breakdown={summary.ingresos.iva} />
                                                            <CashRow label="Total Efectivo" breakdown={summary.ingresos.total} />
                                                        </>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                {/* Egresos Section */}
                                <div className="bg-white rounded-[40px] p-1 shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 lg:px-10 py-8 bg-blue-600">
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                                            <div>
                                                <div className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-1">Egresos Efectivizados (Flujo de Efectivo)</div>
                                                <div className="text-4xl lg:text-5xl font-black text-white tracking-tighter">
                                                    {formatCurrency(summary?.egresos.total_efectivo || 0)}
                                                    <span className="text-lg text-blue-100/50 ml-2 font-medium tracking-normal">MXN</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 lg:gap-4 w-full lg:w-auto">
                                                <button onClick={() => setView('ppd_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all">Explorador PPD</button>
                                                <button onClick={() => setView('rep_received')} className="flex-1 lg:flex-none bg-white/10 hover:bg-white/20 px-4 lg:px-6 py-3 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all">Explorador REP</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <div className="p-6 lg:p-10 min-w-[800px]">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                                        <th className="pb-4 pl-4">Concepto (Egresos)</th>
                                                        <th className="pb-4 px-3 text-right">PUE (Mes)</th>
                                                        <th className="pb-4 px-3 text-right">PPD (Mes)</th>
                                                        <th className="pb-4 px-3 text-right text-blue-600">Suma Devengado (Ded.)</th>
                                                        <th className="pb-4 px-3 text-right text-amber-600">Pendiente Final</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {summary && (
                                                        <>
                                                            <TableRow label="Base Deducible (Subtotal)" breakdown={summary.egresos.subtotal} colorClass="blue" />
                                                            <TableRow label="IVA Facturado" breakdown={summary.egresos.iva} colorClass="blue" />
                                                            <TableRow label="Total Facturado" breakdown={summary.egresos.total} highlight={true} colorClass="blue" />
                                                            <tr className="h-8"></tr>
                                                            <CashRow label="IVA Realizado" breakdown={summary.egresos.iva} colorClass="blue" />
                                                            <CashRow label="Total Efectivo" breakdown={summary.egresos.total} colorClass="blue" />
                                                        </>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Alerts Section */}
                            {summary?.alertas && summary.alertas.length > 0 && (
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Riesgos y Discrepancias</h3>
                                    <div className="flex flex-wrap gap-4">
                                        {summary.alertas.map((alerta: { type: string, message: string }, i: number) => (
                                            <div key={i} className={`flex items-center gap-3 px-6 py-3 rounded-2xl shadow-sm border font-bold text-[10px] uppercase tracking-wider ${alerta.type === 'danger' ? 'bg-red-50 border-red-100 text-red-600' : 'bg-amber-50 border-amber-100 text-amber-600'
                                                }`}>
                                                <span className="material-symbols-outlined text-[18px]">
                                                    {alerta.type === 'danger' ? 'report' : 'warning_amber'}
                                                </span>
                                                {alerta.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : view === 'ppd_issued' ? (
                        <PpdExplorer rfc={activeRfc} tipo="issued" year={period.year} month={period.month} onBack={() => setView('summary')} />
                    ) : view === 'ppd_received' ? (
                        <PpdExplorer rfc={activeRfc} tipo="received" year={period.year} month={period.month} onBack={() => setView('summary')} />
                    ) : view === 'rep_issued' ? (
                        <RepExplorer rfc={activeRfc} tipo="issued" year={period.year} month={period.month} onBack={() => setView('summary')} />
                    ) : (
                        <RepExplorer rfc={activeRfc} tipo="received" year={period.year} month={period.month} onBack={() => setView('summary')} />
                    )}
                </div>
            </main>
        </div>
    );
}
