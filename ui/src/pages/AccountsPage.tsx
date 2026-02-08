import { useState, useEffect } from 'react';
import { listAccounts } from '../services';
import type { Account } from '../models';

export const AccountsPage = ({ onBack, clientName }: { onBack?: () => void, clientName?: string }) => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const data = await listAccounts();
            setAccounts(data);
        } catch (error) {
            console.error("Error fetching accounts:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredAccounts = accounts.filter(acc => {
        const matchesSearch = acc.name.toLowerCase().includes(search.toLowerCase()) ||
            acc.internal_code.includes(search) ||
            acc.sat_code.includes(search);
        const matchesType = filterType === 'all' || acc.type === filterType;
        return matchesSearch && matchesType;
    });

    return (
        <div className="text-gray-800 h-screen flex flex-col bg-[#f8fafc] overflow-hidden">
            <header className="bg-white border-b border-gray-200 h-20 px-8 flex items-center justify-between shadow-sm sticky top-0 z-30 flex-shrink-0">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium group"
                    >
                        <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                        Volver
                    </button>
                    <div className="w-px h-10 bg-gray-200"></div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 leading-tight">Catálogo de Cuentas</h1>
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mt-0.5">{clientName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por código o nombre..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-w-[300px]"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100">
                        <span className="material-symbols-outlined text-lg">add</span>
                        Nueva Cuenta
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-50 transition-all">
                        <span className="material-symbols-outlined text-lg">download</span>
                        Exportar
                    </button>
                </div>
            </header>

            <main className="p-8 flex-1 overflow-hidden flex flex-col">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col flex-1">
                    <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 flex items-center gap-2 flex-shrink-0">
                        {['all', 'Activo', 'Pasivo', 'Capital', 'Ingresos', 'Egresos'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === type ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-200'}`}
                            >
                                {type === 'all' ? 'Todos' : type}
                            </button>
                        ))}
                    </div>

                    <div className="overflow-auto flex-1 h-full">
                        <table className="w-full relative">
                            <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                                <tr className="text-left">
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Código Interno</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Cód. SAT</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Nombre de la Cuenta</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Nivel</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Tipo</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-white">Naturaleza</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center bg-white">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-10 h-10 border-4 border-gray-100 border-t-blue-500 rounded-full animate-spin"></div>
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando catálogo...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredAccounts.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center text-gray-400 uppercase text-[10px] font-bold tracking-widest">
                                            No se encontraron cuentas
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAccounts.map((acc) => (
                                        <tr key={acc.id} className="group hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                                                    {acc.internal_code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="font-mono text-xs text-gray-500">
                                                    {acc.sat_code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {acc.level === 1 ? (
                                                        <span className="material-symbols-outlined text-amber-400 text-lg">folder</span>
                                                    ) : (
                                                        <span className="w-4"></span>
                                                    )}
                                                    <span className={`text-sm ${acc.level === 1 ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                                                        {acc.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                                                    NIVEL {acc.level}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${acc.type === 'Activo' ? 'bg-emerald-50 text-emerald-600' :
                                                        acc.type === 'Pasivo' ? 'bg-red-50 text-red-600' :
                                                            acc.type === 'Capital' ? 'bg-purple-50 text-purple-600' :
                                                                'bg-blue-50 text-blue-600'
                                                    }`}>
                                                    {acc.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-xs text-gray-500">
                                                    {acc.naturaleza}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">edit</span>
                                                    </button>
                                                    <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-600 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-6 py-4 bg-gray-50/30 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            Total: {filteredAccounts.length} cuentas
                        </span>
                    </div>
                </div>
            </main>
        </div>
    );
};
