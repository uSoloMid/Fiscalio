import React, { useState, useEffect } from 'react';
import { processBankStatement, confirmBankStatement, listBankStatements, getBankStatement } from '../services';

export const BankStatementPage = ({ activeRfc, clientName, onBack }: { activeRfc: string, clientName: string, onBack: () => void }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [statements, setStatements] = useState<any[]>([]);

    useEffect(() => {
        loadStatements();
    }, [activeRfc]);

    const loadStatements = async () => {
        try {
            const data = await listBankStatements(activeRfc);
            setStatements(data);
        } catch (e) {
            console.error("Error loading statements", e);
        }
    };

    const handleSelectStatement = async (id: number) => {
        setIsProcessing(true);
        try {
            const data = await getBankStatement(id, activeRfc);
            // Adapt data to match result structure
            setResult({
                banco: data.bank_name,
                fileName: data.file_name,
                movements: data.movements.map((m: any) => ({
                    fecha: m.date,
                    concepto: m.description,
                    referencia: m.reference,
                    cargo: parseFloat(m.cargo),
                    abono: parseFloat(m.abono),
                    saldo: parseFloat(m.saldo)
                })),
                summary: {
                    initialBalance: parseFloat(data.initial_balance),
                    totalCargos: parseFloat(data.total_cargos),
                    totalAbonos: parseFloat(data.total_abonos),
                    finalBalance: parseFloat(data.final_balance)
                }
            });
        } catch (e) {
            alert("Error al cargar detalle");
        } finally {
            setIsProcessing(false);
        }
    };


    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const data = await processBankStatement(file, activeRfc);
            setResult(data);
            setShowConfirmModal(true);
        } catch (err: any) {
            alert(err.message || "Error al procesar el archivo");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await confirmBankStatement({
                rfc: activeRfc,
                bank_name: result.banco,
                account_number: "PREDETERMINADA",
                file_name: result.fileName,
                movements: result.movements,
                summary: result.summary
            }, activeRfc);
            setShowConfirmModal(false);
            setResult(null);
            alert("¡Estado de cuenta guardado con éxito!");
            loadStatements();
        } catch (err) {
            alert("Error al guardar movimientos");
        } finally {
            setIsConfirming(false);
        }
    };

    const handleExportExcel = () => {
        if (!result?.movements || result.movements.length === 0) {
            alert("No hay movimientos para exportar");
            return;
        }

        const headers = ["FECHA", "REFERENCIA", "CONCEPTO", "CARGO", "ABONO", "SALDO"];
        const rows = result.movements.map((m: any) => [
            m.fecha,
            m.referencia || "",
            m.concepto,
            m.cargo,
            m.abono,
            m.saldo
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((r: any) => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Estado_de_Cuenta_${result.banco}_${result.fileName}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatCurrency = (amount: number) => {
        return amount.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        });
    };

    return (
        <div className="flex-1 flex flex-col h-screen bg-[#F0F2F5] overflow-hidden font-['Inter']">
            {/* Header premium igual al mockup */}
            <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-gray-50 rounded-xl transition-all">
                        <span className="material-symbols-outlined text-gray-400">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Importar Estado de Cuenta y Exportar a Excel</h1>
                        <p className="text-xs text-gray-400 font-medium">Panel de procesamiento de estados financieros para <span className="text-emerald-600 font-bold">{clientName}</span></p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined">settings</span></button>
                        <button className="p-2 text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined">help</span></button>
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs border-2 border-white shadow-sm">JD</div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                {/* Botones de acción principales */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-3 px-8 py-3.5 bg-[#10B981] text-white rounded-[20px] font-bold text-sm shadow-xl shadow-emerald-100 hover:bg-[#059669] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group">
                            <span className="material-symbols-outlined group-hover:rotate-90 transition-transform duration-300">add_circle</span>
                            Importar PDF
                            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isProcessing} />
                        </label>
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-3 px-8 py-3.5 bg-white border border-gray-200 text-gray-400 rounded-[20px] font-bold text-sm hover:border-emerald-200 hover:text-emerald-500 hover:shadow-lg hover:shadow-gray-100 transition-all active:scale-[0.98]">
                            <span className="material-symbols-outlined">export_notes</span>
                            Exportar a Excel
                        </button>
                    </div>

                    <div className="flex items-center gap-10">
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Nombre del Banco</p>
                            <p className="text-sm font-bold text-gray-900 border-b-2 border-emerald-500/30 pb-0.5 uppercase tracking-wide">{result?.banco || "PENDIENTE"}</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Nombre de la Cuenta</p>
                            <p className="text-sm font-bold text-gray-900 border-b-2 border-emerald-500/30 pb-0.5 tracking-wide">Operativa Principal</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Número de Cuenta</p>
                            <p className="text-sm font-bold text-gray-400 border-b-2 border-gray-100 pb-0.5 tracking-widest">**** 1234</p>
                        </div>
                    </div>
                </div>

                {/* Kardex Cards (Mockup Style) */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                    <Card title="SALDO INICIAL" amount={result?.summary?.initialBalance || 0} icon="swap_horiz" color="gray" />
                    <Card title="DEPÓSITOS (+)" amount={result?.summary?.totalAbonos || 0} icon="add_circle" color="emerald" plus />
                    <Card title="RETIROS (-)" amount={result?.summary?.totalCargos || 0} icon="remove_circle" color="red" minus />
                    <Card title="SALDO FINAL" amount={result?.summary?.finalBalance || 0} icon="check_circle" color="emerald" highlight />
                </div>

                {/* Tabla de movimientos */}
                <div className="bg-white rounded-[48px] border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden flex flex-col">
                    <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/30">
                        <div className="flex items-center gap-3">
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.3em]">DETALLE DE MOVIMIENTOS</h3>
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                        </div>
                        <div className="px-4 py-1.5 bg-gray-50 rounded-full">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filas procesadas: <span className="text-gray-900">{result?.movements?.length || 0}</span></span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white">
                                    <th className="px-10 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">FECHA</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">REFERENCIA</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">DESCRIPCIÓN</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">CARGOS (-)</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">ABONOS (+)</th>
                                    <th className="px-10 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">SALDO</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50/50">
                                {(result?.movements || []).map((m: any, i: number) => (
                                    <tr key={i} className="hover:bg-emerald-50/30 transition-all duration-200 group">
                                        <td className="px-10 py-5 text-xs font-bold text-gray-500 group-hover:text-emerald-700 transition-colors uppercase tracking-tight">{m.fecha}</td>
                                        <td className="px-6 py-5">
                                            <span className="px-2.5 py-1 bg-gray-50 text-[10px] font-black text-gray-400 rounded-lg group-hover:bg-white group-hover:text-emerald-500 transition-all border border-transparent group-hover:border-emerald-100">{m.referencia || 'N/A'}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs font-bold text-gray-900 leading-normal uppercase group-hover:translate-x-1 transition-transform">{m.concepto}</p>
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono">
                                            <span className={`text-sm font-black ${m.cargo > 0 ? 'text-[#FF4D4D]' : 'text-gray-200'}`}>
                                                {m.cargo > 0 ? `-${(m.cargo || 0).toFixed(2)}` : '0.00'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-right font-mono">
                                            <span className={`text-sm font-black ${m.abono > 0 ? 'text-[#10B981]' : 'text-gray-200'}`}>
                                                {m.abono > 0 ? `+${(m.abono || 0).toFixed(2)}` : '0.00'}
                                            </span>
                                        </td>
                                        <td className="px-10 py-5 text-right font-mono">
                                            <span className="text-sm font-black text-gray-900">{(m.saldo || 0).toFixed(2)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {result && result.movements?.length === 0 && (
                            <div className="py-32 flex flex-col items-center justify-center">
                                <div className="w-24 h-24 bg-red-50 rounded-[32px] flex items-center justify-center mb-6 border-2 border-dashed border-red-100">
                                    <span className="material-symbols-outlined text-red-200 text-5xl">error</span>
                                </div>
                                <h4 className="text-red-400 text-sm font-bold uppercase tracking-[0.2em] mb-2">No se encontraron movimientos</h4>
                                <p className="text-gray-400 text-xs font-medium italic text-center px-10">El PDF fue leído pero no pudimos identificar las transacciones. <br />Verifica que el PDF no sea una imagen escaneada.</p>
                            </div>
                        )}

                        {!result && (
                            <div className="py-10 px-10">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">HISTORIAL DE IMPORTACIONES</h3>
                                    <span className="px-3 py-1 bg-emerald-50 text-[10px] font-black text-emerald-600 rounded-full border border-emerald-100">Mostrando {statements.length} registros</span>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {statements.length > 0 ? statements.map((s) => (
                                        <div
                                            key={s.id}
                                            onClick={() => handleSelectStatement(s.id)}
                                            className="bg-white border border-gray-100 p-6 rounded-[32px] flex items-center justify-between hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/20 transition-all cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-6">
                                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-emerald-500">account_balance</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-gray-900 uppercase">{s.bank_name}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">{s.file_name}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-12">
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Movimientos</p>
                                                    <p className="text-sm font-black text-gray-900">{s.movements_count || 0}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Final</p>
                                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(parseFloat(s.final_balance))}</p>
                                                </div>
                                                <div className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:border-emerald-200 group-hover:text-emerald-500 transition-all">
                                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="py-20 flex flex-col items-center justify-center bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-100">
                                            <span className="material-symbols-outlined text-gray-200 text-5xl mb-4">history</span>
                                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">No hay historial disponible</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {result && (
                            <div className="py-12 flex flex-col items-center border-t border-gray-50 bg-gradient-to-b from-gray-50/30 to-white">
                                <div className="h-8 w-px bg-emerald-500/20 mb-4"></div>
                                <p className="text-[10px] font-black text-gray-400 italic uppercase tracking-[0.3em]">Fin de los registros cargados temporalmente</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer de status premium */}
            <footer className="bg-white border-t border-gray-100 px-8 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400 shadow-sm shadow-emerald-200'}`}></div>
                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{isProcessing ? 'Procesando datos...' : 'Sistema Listo'}</span>
                    </div>
                    <div className="h-4 w-px bg-gray-100 hidden sm:block"></div>
                    <div className="hidden sm:flex items-center gap-3">
                        <div className="p-1.5 bg-gray-50 rounded-lg">
                            <span className="material-symbols-outlined text-gray-400 text-sm">description</span>
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">bank_statement_2024.pdf</span>
                    </div>
                </div>

                <div className="flex items-center gap-8">
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-between w-48 px-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em]">MOTOR OCR (TESSERACT)</span>
                            <span className="text-[9px] font-black text-emerald-500">{isProcessing ? '50%' : '100%'}</span>
                        </div>
                        <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full bg-emerald-500 transition-all duration-1000 ease-in-out ${isProcessing ? 'w-1/2' : 'w-full shadow-sm shadow-emerald-200'}`}></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 group cursor-default">
                        <span className="material-symbols-outlined text-gray-300 group-hover:text-emerald-400 transition-colors text-xl">public</span>
                        <span className="text-[10px] font-black text-gray-300 group-hover:text-gray-500 transition-colors uppercase tracking-widest">v1.2.4-stable</span>
                    </div>
                </div>
            </footer>

            {/* Overlay de procesamiento con animación premium */}
            {isProcessing && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-2xl animate-in fade-in duration-500"></div>
                    <div className="relative flex flex-col items-center">
                        {/* Animación de carga central */}
                        <div className="relative w-48 h-48 mb-12">
                            {/* Círculo rotando exterior */}
                            <div className="absolute inset-0 border-[6px] border-emerald-50 rounded-full"></div>
                            <div className="absolute inset-0 border-[6px] border-emerald-500 rounded-full animate-spin border-t-transparent shadow-lg shadow-emerald-200"></div>

                            {/* Icono de PDF que sube y baja */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-6xl text-emerald-600 animate-bounce">picture_as_pdf</span>
                            </div>

                            {/* Partículas de "procesamiento" */}
                            <div className="absolute top-0 right-0 w-4 h-4 bg-emerald-400 rounded-full animate-ping"></div>
                            <div className="absolute bottom-0 left-10 w-3 h-3 bg-emerald-300 rounded-full animate-pulse delay-500"></div>
                        </div>

                        <div className="text-center">
                            <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight animate-pulse">
                                Convirtiendo PDF a Datos...
                            </h2>
                            <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.3em] italic animate-bounce">
                                Clasificando Banco y Extrayendo Movimientos
                            </p>

                            <div className="mt-12 flex items-center justify-center gap-4">
                                <div className="flex -space-x-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 border-4 border-white flex items-center justify-center shadow-sm">
                                        <span className="material-symbols-outlined text-blue-500 text-sm">database</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 border-4 border-white flex items-center justify-center shadow-sm">
                                        <span className="material-symbols-outlined text-emerald-500 text-sm">memory</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-purple-100 border-4 border-white flex items-center justify-center shadow-sm">
                                        <span className="material-symbols-outlined text-purple-500 text-sm">auto_awesome</span>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Motor Fiscalio v2.0 Activo</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación premium (Mockup Style) */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-300"></div>
                    <div className="relative w-full max-w-lg bg-white rounded-[48px] shadow-2xl overflow-hidden p-12 transition-all animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center mb-8 shadow-inner border border-emerald-100/50">
                                <span className="material-symbols-outlined text-[#10B981] text-4xl">account_balance_wallet</span>
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Confirmar Totales Extraídos</h2>
                            <p className="text-sm text-gray-400 leading-relaxed font-medium mb-12">
                                El procesamiento automático ha finalizado. Por favor valide los resultados antes de guardarlos de forma permanente.
                            </p>

                            <div className="w-full space-y-5 mb-12">
                                <div className="bg-[#10B981]/5 p-6 rounded-[32px] flex items-center justify-between border border-[#10B981]/10 group hover:bg-[#10B981]/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                        <span className="text-xs font-black text-emerald-800 tracking-wider">TOTAL ABONOS (+)</span>
                                    </div>
                                    <span className="text-2xl font-black text-[#10B981]">{formatCurrency(result?.summary?.totalAbonos || 0)}</span>
                                </div>
                                <div className="bg-[#FF4D4D]/5 p-6 rounded-[32px] flex items-center justify-between border border-[#FF4D4D]/10 group hover:bg-[#FF4D4D]/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-[#FF4D4D]"></div>
                                        <span className="text-xs font-black text-red-800 tracking-wider">TOTAL CARGOS (-)</span>
                                    </div>
                                    <span className="text-2xl font-black text-[#FF4D4D]">{formatCurrency(result?.summary?.totalCargos || 0)}</span>
                                </div>

                                <div className="pt-8 border-t border-dashed border-gray-100 flex flex-col items-center gap-1.5">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">Saldo resultante</span>
                                    <h3 className="text-5xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency((result?.summary?.totalAbonos || 0) - (result?.summary?.totalCargos || 0))}
                                    </h3>
                                    <div className="mt-6 flex items-center gap-2.5 px-6 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100 animate-bounce">
                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                        COINCIDE CON LA CARÁTULA
                                    </div>
                                </div>
                            </div>

                            <div className="w-full space-y-5">
                                <button
                                    onClick={handleConfirm}
                                    disabled={isConfirming}
                                    className="w-full py-5 bg-[#10B981] text-white font-black rounded-[24px] shadow-2xl shadow-emerald-200/50 hover:bg-[#059669] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 tracking-widest text-xs uppercase disabled:opacity-50"
                                >
                                    <span className={`material-symbols-outlined ${isConfirming ? 'animate-spin' : ''}`}>
                                        {isConfirming ? 'sync' : 'verified'}
                                    </span>
                                    {isConfirming ? 'Guardando...' : 'Sí, los totales son correctos'}
                                </button>
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-red-500 transition-colors"
                                >
                                    No, los montos no coinciden (Volver a procesar)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Card = ({ title, amount, icon, color, plus, minus, highlight }: any) => {
    let bg = "bg-white border-gray-100 shadow-xl shadow-gray-100/30";
    let iconBg = "bg-gray-50 text-gray-400";
    let textAmount = "text-gray-900";
    let labelColor = "text-gray-400";

    if (color === 'emerald') {
        iconBg = "bg-emerald-50 text-emerald-500";
        if (highlight) {
            bg = "bg-[#10B981] border-[#10B981] shadow-2xl shadow-emerald-200/50 text-white";
            iconBg = "bg-white/20 text-white";
            textAmount = "text-white";
            labelColor = "text-white/70";
        } else {
            textAmount = "text-emerald-500 font-black";
        }
    } else if (color === 'red') {
        iconBg = "bg-red-50 text-red-500";
        textAmount = "text-[#FF4D4D] font-black";
    }

    return (
        <div className={`${bg} rounded-[40px] border p-10 transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl cursor-default flex flex-col justify-between h-52`}>
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${labelColor}`}>{title}</span>
                <div className={`p-3 rounded-2xl ${iconBg}`}>
                    <span className="material-symbols-outlined text-2xl">{icon}</span>
                </div>
            </div>
            <div className="mt-10 overflow-hidden">
                <h4 className={`text-4xl font-black ${textAmount} tracking-tighter truncate leading-none`}>
                    {plus ? '+ ' : minus ? '- ' : ''}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h4>
            </div>
        </div>
    );
};
