import { useEffect, useState } from 'react';
import { listPpdExplorer, listRepExplorer } from '../services';

interface ExplorerProps {
    rfc: string;
    tipo: 'issued' | 'received';
    year: number;
    month: number;
    onBack: () => void;
}

export function PpdExplorer({ rfc, tipo, year, month, onBack }: ExplorerProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await listPpdExplorer({ rfc, tipo, year, month });
                setData(res.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [rfc, tipo, year, month]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                    Explorador de PPD ({tipo === 'issued' ? 'Emitidas' : 'Recibidas'})
                </h3>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Serie / Folio</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{tipo === 'issued' ? 'Receptor' : 'Emisor'}</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Pagado</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Saldo</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={7} className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div></td></tr>
                        ) : data.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-20 text-gray-400">No se encontraron facturas PPD en este periodo</td></tr>
                        ) : data.map((item) => (
                            <tr key={item.uuid} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-gray-900 text-center">{new Date(item.fecha).toLocaleDateString()}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-black text-gray-900">{item.serie} {item.folio}</div>
                                    <div className="text-[9px] font-mono text-gray-400 uppercase tracking-tighter truncate max-w-[100px]">{item.uuid}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-gray-700 truncate max-w-[200px]">{tipo === 'issued' ? item.name_receptor : item.name_emisor}</div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{tipo === 'issued' ? item.rfc_receptor : item.rfc_emisor}</div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="text-sm font-black text-gray-900">{formatCurrency(item.total)}</div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="text-sm font-bold text-emerald-600">{formatCurrency(item.monto_pagado)}</div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="text-sm font-bold text-amber-600">{formatCurrency(item.saldo_pendiente)}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status_pago === 'Liquidada' ? 'bg-emerald-100 text-emerald-700' :
                                                item.status_pago === 'Parcial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {item.status_pago}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function RepExplorer({ rfc, tipo, year, month, onBack }: ExplorerProps) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await listRepExplorer({ rfc, tipo, year, month });
                setData(res.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [rfc, tipo, year, month]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                    Complementos de Pago (REP)
                </h3>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading ? (
                    <div className="text-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div></div>
                ) : data.length === 0 ? (
                    <div className="bg-white rounded-3xl p-20 text-center text-gray-400 border border-dashed border-gray-200">
                        No se encontraron complementos de pago en este periodo
                    </div>
                ) : data.map((rep) => (
                    <div key={rep.uuid} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:border-emerald-200 transition-all">
                        <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
                                    <span className="material-symbols-outlined text-3xl font-black">payments</span>
                                </div>
                                <div>
                                    <div className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                        REP - {new Date(rep.fecha).toLocaleDateString()}
                                    </div>
                                    <div className="text-lg font-black text-gray-900">
                                        {rep.serie} {rep.folio}
                                    </div>
                                    <div className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">
                                        {tipo === 'issued' ? rep.name_receptor : rep.name_emisor}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Pagado</div>
                                <div className="text-2xl font-black text-gray-900">{formatCurrency(rep.total)}</div>
                                <button
                                    onClick={() => setSelectedUuid(selectedUuid === rep.uuid ? null : rep.uuid)}
                                    className="mt-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 ml-auto"
                                >
                                    {rep.relacionados?.length || 0} Facturas relacionadas
                                    <span className="material-symbols-outlined text-[14px]">
                                        {selectedUuid === rep.uuid ? 'expand_less' : 'expand_more'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {selectedUuid === rep.uuid && (
                            <div className="bg-gray-50/50 border-t border-gray-100 p-6 space-y-4 animate-in slide-in-from-top-2">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Desglose del Pago</h4>
                                {rep.relacionados?.map((rel: any, i: number) => (
                                    <div key={i} className="bg-white rounded-2xl p-4 flex justify-between items-center shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 text-xs font-bold">
                                                {rel.num_parcialidad}
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter truncate max-w-[150px]">UUID: {rel.uuid_relacionado}</div>
                                                <div className="text-[10px] font-bold text-gray-600">
                                                    Parcialidad {rel.num_parcialidad} · Saldo Ant: {formatCurrency(rel.saldo_anterior)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-gray-900">{formatCurrency(rel.monto_pagado)}</div>
                                            <div className="text-[9px] font-bold text-gray-400 uppercase">Abono</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
