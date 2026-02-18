import { useEffect, useState } from 'react';
import {
    getProvisionalSummary,
    getBucketDetails,
    updateDeductibility,
    exportDetailedBucketPdf,
    exportCfdiPdf,
    exportProvisionalExcel
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
    'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
    'D02': 'Gastos médicos por incapacidad o discapacidad',
    'D03': 'Gastos funerales',
    'D04': 'Donativos',
    'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
    'D06': 'Aportaciones voluntarias al SAR',
    'D07': 'Primas por seguros de gastos médicos',
    'D08': 'Gastos de transportación escolar obligatoria',
    'D09': 'Depósitos en cuentas especiales para el ahorro, primas que tengan como base planes de pensiones',
    'D10': 'Pagos por servicios educativos (colegiaturas)',
    'P01': 'Por definir',
    'S01': 'Sin efectos fiscales',
    'CP01': 'Pagos'
};

interface ProvisionalControlPageProps {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
    currentPeriod: { year: number, month: number };
    onPeriodChange: (year: number, month: number) => void;
}

export function ProvisionalControlPage({ activeRfc, clientName, onBack, currentPeriod, onPeriodChange }: ProvisionalControlPageProps) {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailBucket, setDetailBucket] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<any[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [view, setView] = useState<'summary' | 'ppd_issued' | 'ppd_received' | 'rep_issued' | 'rep_received'>('summary');

    const [period, setPeriod] = useState(currentPeriod);
    const [updatingUuid, setUpdatingUuid] = useState<string | null>(null);

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const data = await getProvisionalSummary(activeRfc, period.year, period.month);
            setSummary(data);
        } catch (error) {
            console.error("Error fetching provisional summary", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, [activeRfc, period]);

    const loadBucketDetail = async (bucket: string) => {
        setDetailBucket(bucket);
        setLoadingDetail(true);
        try {
            const data = await getBucketDetails({
                rfc: activeRfc,
                year: period.year,
                month: period.month,
                bucket
            });
            setDetailData(data);
        } catch (error) {
            console.error("Error fetching bucket details", error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const toggleDeductibility = async (item: any) => {
        if (updatingUuid) return;
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
                        <button
                            onClick={() => exportProvisionalExcel({ rfc: activeRfc, year: period.year, month: period.month })}
                            className="p-2 md:p-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all flex items-center gap-2"
                            title="Exportar a Excel"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-xs md:text-sm font-bold hidden sm:inline">Excel</span>
                        </button>
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
                            {/* Summary Totals Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all group">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="w-12 md:w-14 h-12 md:h-14 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                                            <svg className="w-6 md:w-7 h-6 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-full">Efectivo</span>
                                    </div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Ingresos del Mes</div>
                                    <div className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency(summary?.ingresos.total_efectivo || 0)}
                                    </div>
                                </div>

                                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all group">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="w-12 md:w-14 h-12 md:h-14 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all duration-500">
                                            <svg className="w-6 md:w-7 h-6 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Deducible</span>
                                    </div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Gastos del Mes</div>
                                    <div className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency(summary?.egresos.total_efectivo || 0)}
                                    </div>
                                </div>

                                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all group lg:col-span-2 overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/30 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between h-full gap-6 md:gap-0">
                                        <div>
                                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                                Balance Operativo (Estimado)
                                            </div>
                                            <div className="text-3xl md:text-4xl font-black text-gray-900 tracking-tighter">
                                                {formatCurrency((summary?.ingresos.total_efectivo || 0) - (summary?.egresos.total_efectivo || 0))}
                                            </div>
                                        </div>
                                        <div className="flex gap-4 md:gap-8 border-l border-gray-100 pl-0 md:pl-8 w-full md:w-auto">
                                            <div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">IVA Trasladado</div>
                                                <div className="text-lg font-black text-emerald-600">{formatCurrency(summary?.ingresos.iva.suma_efectivo || 0)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">IVA Acreditable</div>
                                                <div className="text-lg font-black text-blue-600">{formatCurrency(summary?.egresos.iva.suma_efectivo || 0)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tables Container */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                                {/* Ingresos Table */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between px-4">
                                        <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3">
                                            <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                                            Cuadro de Ingresos
                                        </h2>
                                        <div className="flex gap-2">
                                            <button onClick={() => setView('ppd_issued')} className="text-[10px] font-black text-gray-400 hover:text-emerald-600 uppercase tracking-widest bg-white border border-gray-100 px-3 py-1.5 rounded-xl transition-all shadow-sm">PPD Explorer</button>
                                            <button onClick={() => setView('rep_issued')} className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest bg-white border border-gray-100 px-3 py-1.5 rounded-xl transition-all shadow-sm">REP Explorer</button>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                                    <th className="py-4 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">PUE</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">PPD</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">REP</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-emerald-600 uppercase tracking-widest">Efectivo</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-orange-500 uppercase tracking-widest">Pendiente</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                <TableRow label="Base (Subtotal)" data={summary?.ingresos.subtotal} bucketPrefix="ingresos_subtotal" isMain={true} />
                                                <TableRow label="IVA (16%)" data={summary?.ingresos.iva} bucketPrefix="ingresos_iva" />
                                                <TableRow label="Retenciones" data={summary?.ingresos.retenciones} bucketPrefix="ingresos_retenciones" />
                                                <TableRow label="Total Facturado" data={summary?.ingresos.total} bucketPrefix="ingresos_total" isMain={true} />
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                {/* Egresos Table */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between px-4">
                                        <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3">
                                            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                                            Cuadro de Gastos
                                        </h2>
                                        <div className="flex gap-2">
                                            <button onClick={() => setView('ppd_received')} className="text-[10px] font-black text-gray-400 hover:text-emerald-600 uppercase tracking-widest bg-white border border-gray-100 px-3 py-1.5 rounded-xl transition-all shadow-sm">PPD Explorer</button>
                                            <button onClick={() => setView('rep_received')} className="text-[10px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest bg-white border border-gray-100 px-3 py-1.5 rounded-xl transition-all shadow-sm">REP Explorer</button>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                                    <th className="py-4 px-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">PUE</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">PPD</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">REP</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-blue-600 uppercase tracking-widest">Deducible</th>
                                                    <th className="py-4 px-8 text-right text-[10px] font-black text-orange-500 uppercase tracking-widest">CxP</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                <TableRow label="Base (Subtotal)" data={summary?.egresos.subtotal} bucketPrefix="egresos_subtotal" isMain={true} />
                                                <TableRow label="IVA (16%)" data={summary?.egresos.iva} bucketPrefix="egresos_iva" />
                                                <TableRow label="Retenciones" data={summary?.egresos.retenciones} bucketPrefix="egresos_retenciones" />
                                                <TableRow label="Total Gastado" data={summary?.egresos.total} bucketPrefix="egresos_total" isMain={true} />
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>

                            {/* No Deducibles & Alerts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] p-10 text-white relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 transition-all duration-700 group-hover:bg-blue-500/20"></div>
                                    <div className="relative z-10">
                                        <h3 className="text-xl font-black mb-10 tracking-tight flex items-center gap-3">
                                            <span className="w-1.5 h-6 bg-blue-400 rounded-full"></span>
                                            Gastos No Deducibles
                                        </h3>
                                        <div className="grid grid-cols-2 gap-10">
                                            <button onClick={() => loadBucketDetail('egresos_nodeducibles')} className="text-left group/item">
                                                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Pagados (PUE/REP)</div>
                                                <div className="text-3xl font-black group-hover/item:text-blue-300 transition-colors">{formatCurrency(summary?.no_deducibles.total_efectivo || 0)}</div>
                                            </button>
                                            <button onClick={() => loadBucketDetail('egresos_nodeducibles_pendiente')} className="text-left group/item">
                                                <div className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">Pendientes (CxP)</div>
                                                <div className="text-3xl font-black group-hover/item:text-orange-300 transition-colors">{formatCurrency(summary?.no_deducibles.total_pendiente || 0)}</div>
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                {summary?.alertas && summary.alertas.length > 0 && (
                                    <section className="bg-orange-50 rounded-[3rem] p-10 border border-orange-100">
                                        <h3 className="text-xl font-black text-orange-900 mb-6 tracking-tight flex items-center gap-3">
                                            <span className="w-1.5 h-6 bg-orange-400 rounded-full"></span>
                                            Alertas de consistencia
                                        </h3>
                                        <div className="space-y-4">
                                            {summary.alertas.map((alerta, idx) => (
                                                <div key={idx} className="flex gap-4 items-start bg-white/50 p-5 rounded-2xl border border-orange-100">
                                                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                    </div>
                                                    <div className="text-sm font-semibold text-orange-800 leading-relaxed">{alerta.message}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* Slide-over Detail Panel */}
            {detailBucket && (
                <>
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-300" onClick={() => setDetailBucket(null)}></div>
                    <div className={`absolute top-0 right-0 h-full w-full max-w-4xl bg-white shadow-2xl z-50 transform transition-transform duration-500 ease-out animate-in slide-in-from-right flex flex-col`}>
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 italic">
                                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full not-italic"></span>
                                    Detalle del Bucket
                                </h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{detailBucket.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadPdf}
                                    className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
                                    title="Descargar PDF"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                </button>
                                <button onClick={() => setDetailBucket(null)} className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-50/30">
                            {loadingDetail ? (
                                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                    <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Trayendo facturas...</div>
                                </div>
                            ) : detailData.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-gray-300">
                                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                        </svg>
                                    </div>
                                    <div className="text-sm font-black text-gray-400 uppercase tracking-widest">No hay registros en este periodo</div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {detailData.map((item) => (
                                        <div key={item.uuid} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all group/item overflow-hidden relative">
                                            {/* Decoration */}
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${item.is_deductible ? 'bg-emerald-500' : 'bg-red-400'}`}></div>

                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                        <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg flex-shrink-0 tracking-widest">
                                                            {item.fecha}
                                                        </span>
                                                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg tracking-widest uppercase ${item.metodo_pago === 'PUE' ? 'bg-emerald-50 text-emerald-600' : item.metodo_pago === 'REP' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                            {item.metodo_pago}
                                                        </span>
                                                        <span className="text-[10px] font-black bg-gray-50 text-gray-400 px-3 py-1.5 rounded-lg truncate tracking-wider">
                                                            UUID: {item.uuid}
                                                        </span>
                                                    </div>
                                                    <div className="text-base font-black text-gray-900 truncate mb-1">{item.nombre}</div>
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        <span>{USO_CFDI[item.uso_cfdi] || item.uso_cfdi}</span>
                                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                        <span>F. Pago: {item.forma_pago}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col md:items-end gap-1 flex-shrink-0">
                                                    <div className="text-2xl font-black text-gray-900 tracking-tighter">{formatCurrency(item.total)}</div>
                                                    <div className="flex gap-4 text-[10px] font-black">
                                                        <span className="text-gray-400">SUB: {formatCurrency(item.subtotal)}</span>
                                                        <span className="text-emerald-500">IVA: {formatCurrency(item.iva)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 pt-4 md:pt-0 md:pl-6 md:border-l md:border-gray-50 flex-shrink-0">
                                                    {detailBucket.startsWith('egresos') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleDeductibility(item); }}
                                                            disabled={!!updatingUuid}
                                                            className={`p-3 rounded-2xl transition-all group/btn ${item.is_deductible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                                                            title={item.is_deductible ? "Marcar como No Deducible" : "Marcar como Deducible"}
                                                        >
                                                            {updatingUuid === item.uuid ? (
                                                                <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                                            ) : (
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.is_deductible ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                    <button onClick={() => exportCfdiPdf(item.uuid)} className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-all" title="Ver PDF">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="mt-12 bg-gray-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden">
                                        <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mb-20"></div>
                                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                            <div>
                                                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Resumen Dinámico</div>
                                                <div className="text-base font-bold text-gray-400 leading-relaxed">
                                                    Has seleccionado <span className="text-white">{detailData.length}</span> registros que suman un total de <span className="text-white">{formatCurrency(detailData.reduce((acc, curr) => acc + curr.total, 0))}</span>.
                                                </div>
                                            </div>
                                            <div className="flex gap-4 w-full md:w-auto">
                                                <div className="flex-1 md:flex-none bg-white/5 border border-white/10 p-5 rounded-3xl text-center">
                                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Items</div>
                                                    <div className="text-xl font-black">{detailData.length}</div>
                                                </div>
                                                <div className="flex-1 md:flex-none bg-white/5 border border-white/10 p-5 rounded-3xl text-center">
                                                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Promedio</div>
                                                    <div className="text-xl font-black">{formatCurrency(detailData.length > 0 ? detailData.reduce((acc, curr) => acc + curr.total, 0) / detailData.length : 0)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
