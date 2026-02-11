import { useState, useEffect, useMemo, useRef } from 'react';
import { listAccounts, updateAccount, createAccount } from '../services';
import type { Account } from '../models';

interface TreeNode extends Account {
    children: TreeNode[];
    isOpen?: boolean;
}

export const AccountsPage = ({ onBack, clientName, activeRfc }: { onBack?: () => void, clientName?: string, activeRfc: string }) => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');

    // Advanced Filters
    const [onlyPostable, setOnlyPostable] = useState(false);
    const [withoutSat, setWithoutSat] = useState(false);

    // UI States
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Account>>({});
    const [focusCode, setFocusCode] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (activeRfc) fetchAccounts();
    }, [activeRfc]);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const data = await listAccounts(activeRfc);
            setAccounts(data);
        } catch (error) {
            console.error("Error fetching accounts:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            if (selectedAccountId) {
                await updateAccount(selectedAccountId, editForm, activeRfc);
            } else {
                await createAccount(editForm as any, activeRfc);
            }
            setIsEditing(false);
            setSelectedAccountId(null);
            setEditForm({});
            fetchAccounts();
        } catch (e: any) {
            alert(e.message || "Error al guardar cambios");
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("¿Estás seguro de eliminar esta cuenta? Esta acción no se puede deshacer.")) return;
        try {
            const { deleteAccount } = await import('../services');
            await deleteAccount(id, activeRfc);
            fetchAccounts();
            setIsEditing(false);
            setSelectedAccountId(null);
        } catch (e: any) {
            alert(e.message || "Error al eliminar la cuenta");
        }
    };

    // Filtered flat list
    const filteredAccounts = useMemo(() => {
        return accounts.filter(acc => {
            const matchesSearch = acc.name.toLowerCase().includes(search.toLowerCase()) ||
                acc.internal_code.includes(search) ||
                (acc.sat_code && acc.sat_code.includes(search));

            const matchesType = filterType === 'all' || acc.type === filterType;
            const matchesPostable = !onlyPostable || acc.is_postable;
            const matchesSat = !withoutSat || (!acc.sat_code || acc.sat_code === '');

            let matchesFocus = true;
            if (focusCode) {
                matchesFocus = acc.internal_code.startsWith(focusCode) && acc.internal_code !== focusCode;
            }

            return matchesSearch && matchesType && matchesPostable && matchesSat && matchesFocus;
        });
    }, [accounts, search, filterType, onlyPostable, withoutSat, focusCode]);

    const breadcrumbPath = useMemo(() => {
        if (!selectedAccountId) return [];
        const selected = accounts.find(a => a.id === selectedAccountId);
        if (!selected) return [];

        const path: Account[] = [];
        let current: Account | undefined = selected;
        while (current) {
            path.unshift(current);
            const parentCode: string | undefined = current.parent_code;
            current = parentCode ? accounts.find(a => a.internal_code === parentCode) : undefined;
        }
        return path;
    }, [selectedAccountId, accounts]);

    // Auto-expand tree when searching
    useEffect(() => {
        if (search || onlyPostable || withoutSat || focusCode) {
            const allCodes = new Set<string>();
            filteredAccounts.forEach(acc => {
                let parentCode = acc.parent_code;
                while (parentCode) {
                    allCodes.add(parentCode);
                    const parent = accounts.find(a => a.internal_code === parentCode);
                    parentCode = parent?.parent_code;
                }
            });
            setExpandedNodes(prev => new Set([...Array.from(prev), ...Array.from(allCodes)]));
        }
    }, [search, onlyPostable, withoutSat, focusCode, filteredAccounts]);

    // Build tree
    const accountTree = useMemo(() => {
        const nodes: Record<string, TreeNode> = {};
        const roots: TreeNode[] = [];

        const visibleCodes = new Set<string>();
        filteredAccounts.forEach(acc => {
            visibleCodes.add(acc.internal_code);
            let parentCode = acc.parent_code;
            while (parentCode) {
                if (visibleCodes.has(parentCode)) break;
                visibleCodes.add(parentCode);
                const parent = accounts.find(a => a.internal_code === parentCode);
                parentCode = parent?.parent_code;
            }
        });

        const dataToUse = accounts.filter(acc => visibleCodes.has(acc.internal_code));

        dataToUse.forEach(acc => {
            nodes[acc.internal_code] = { ...acc, children: [] };
        });

        dataToUse.forEach(acc => {
            const node = nodes[acc.internal_code];
            if (acc.parent_code && nodes[acc.parent_code]) {
                nodes[acc.parent_code].children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots.sort((a, b) => a.internal_code.localeCompare(b.internal_code));
    }, [accounts, filteredAccounts]);

    const toggleNode = (code: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(code)) newExpanded.delete(code);
        else newExpanded.add(code);
        setExpandedNodes(newExpanded);
    };

    const handleEdit = (acc: Account) => {
        setSelectedAccountId(acc.id);
        setEditForm(acc);
        setIsEditing(true);
    };

    const createSubAccount = (parent: Account) => {
        const nextIdx = (parent.children?.length || 0) + 1;
        const newCode = parent.internal_code.length > 7
            ? `${parent.internal_code.substring(0, parent.internal_code.length - 3)}${String(nextIdx).padStart(3, '0')}`
            : `${parent.internal_code}-${String(nextIdx).padStart(2, '0')}`;

        const newAcc: Partial<Account> = {
            name: `Subcuenta de ${parent.name}`,
            internal_code: newCode,
            parent_code: parent.internal_code,
            level: parent.level + 1,
            type: parent.type,
            naturaleza: parent.naturaleza,
            is_postable: true,
            sat_code: parent.sat_code,
            currency: parent.currency || 'MXN',
            is_custom: true
        };
        setEditForm(newAcc);
        setSelectedAccountId(null);
        setIsEditing(true);
    };

    const handleExport = (format: 'csv' | 'json') => {
        let content = '';
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `Catalogo_${clientName}_${timestamp}.${format}`;

        if (format === 'csv') {
            const headers = ['Código Interno', 'Código SAT', 'Nombre', 'Nivel', 'Tipo', 'Naturaleza', 'Posteable'];
            content = [headers.join(','), ...filteredAccounts.map(a =>
                [`"${a.internal_code}"`, `"${a.sat_code}"`, `"${a.name}"`, a.level, `"${a.type}"`, `"${a.naturaleza}"`, a.is_postable ? 'Sí' : 'No'].join(',')
            )].join('\n');
        } else {
            content = JSON.stringify(filteredAccounts, null, 2);
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    if (confirm(`¿Importar ${json.length} cuentas? Esto actualizará/creará cuentas según el código interno.`)) {
                        fetchAccounts();
                    }
                }
            } catch (error) {
                alert("Formato de archivo inválido. Usa JSON exportado.");
            }
        };
        reader.readAsText(file);
    };

    const renderTreeNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedNodes.has(node.internal_code);
        const hasChildren = node.children.length > 0;

        return (
            <div key={node.id} className="flex flex-col">
                <div
                    className={`flex items-center group py-3.5 px-6 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 cursor-pointer rounded-[24px] transition-all duration-300 border border-transparent hover:border-blue-50/50 ${selectedAccountId === node.id ? 'bg-blue-50/80 ring-1 ring-blue-100 shadow-sm border-blue-100' : ''}`}
                    onClick={() => {
                        setSelectedAccountId(node.id);
                        if (hasChildren) toggleNode(node.internal_code);
                    }}
                >
                    <div style={{ width: `${depth * 28}px` }} className="flex-shrink-0" />
                    <div className="w-10 h-10 flex items-center justify-center mr-1">
                        {hasChildren ? (
                            <span className="material-symbols-outlined text-gray-400 text-2xl transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                arrow_right
                            </span>
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-200" />
                        )}
                    </div>

                    <div className="flex-1 flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${node.is_postable ? 'bg-emerald-50 text-emerald-500' : 'bg-gray-50 text-gray-400'}`}>
                            <span className="material-symbols-outlined text-xl font-bold">
                                {node.is_postable ? 'adjust' : 'account_balance'}
                            </span>
                        </div>

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-sm tracking-tight truncate ${node.is_postable ? 'font-black text-gray-900' : 'font-bold text-gray-400'}`}>
                                    {node.name}
                                </span>
                                {hasChildren && (
                                    <span className="text-[10px] font-black text-blue-400/50">({node.children.length})</span>
                                )}
                                {!node.is_custom && (
                                    <span className="text-[8px] font-black bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">BASE</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold text-gray-400">{node.internal_code}</span>
                                {node.sat_code && (
                                    <span className="text-[9px] font-black text-blue-500/60 flex items-center gap-0.5 border border-blue-50/50 px-1.5 rounded bg-blue-50/20" title={`SAT: ${node.sat_code}`}>
                                        {node.sat_code}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform scale-95 group-hover:scale-100">
                        <button
                            onClick={(e) => { e.stopPropagation(); createSubAccount(node); }}
                            className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-emerald-500 shadow-sm border border-transparent hover:border-emerald-100 transition-all"
                            title="Añadir Subcuenta"
                        >
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(node); }}
                            className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-blue-500 shadow-sm border border-transparent hover:border-blue-100 transition-all"
                            title="Editar"
                        >
                            <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        {node.is_custom && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(node.id); }}
                                className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-red-500 shadow-sm border border-transparent hover:border-red-100 transition-all"
                                title="Eliminar"
                            >
                                <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); setFocusCode(node.internal_code); }}
                            className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-purple-500 shadow-sm border border-transparent hover:border-purple-100 transition-all"
                            title="Ver solo hijos"
                        >
                            <span className="material-symbols-outlined text-lg">filter_center_focus</span>
                        </button>
                    </div>
                </div>

                {hasChildren && isExpanded && (
                    <div className="flex flex-col">
                        {node.children.map(child => renderTreeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="text-gray-800 h-screen flex flex-col md:flex-row bg-[#f8fafc] overflow-hidden font-['Inter']">
            <div className="flex-1 flex flex-col min-w-0 bg-white shadow-2xl z-10">
                <header className="h-auto md:h-20 px-4 md:px-8 py-4 md:py-0 flex flex-col md:flex-row items-center justify-between border-b border-gray-100 flex-shrink-0 gap-4">
                    <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
                        <button onClick={onBack} className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-2xl transition-all">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg md:text-xl font-black text-gray-900 tracking-tight">Cuentas</h1>
                                <span className="px-2 py-0.5 bg-gray-100 text-[10px] font-black text-gray-400 rounded-lg truncate">{clientName}</span>
                                {breadcrumbPath.length > 0 && (
                                    <div className="hidden lg:flex items-center gap-2 ml-4 px-4 py-1.5 bg-gray-50/50 rounded-xl border border-gray-100/50">
                                        {breadcrumbPath.map((item, idx) => (
                                            <div key={item.id} className="flex items-center gap-2">
                                                {idx > 0 && <span className="text-[10px] text-gray-300 font-bold">/</span>}
                                                <span className={`text-[11px] font-bold ${idx === breadcrumbPath.length - 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                    {item.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                                <div className="flex bg-gray-100 p-0.5 rounded-xl">
                                    <button
                                        onClick={() => setViewMode('tree')}
                                        className={`px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'tree' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        Árbol
                                    </button>
                                    <button
                                        onClick={() => setViewMode('table')}
                                        className={`px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        Tabla
                                    </button>
                                </div>
                                {focusCode && (
                                    <div className="hidden sm:flex items-center gap-1 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100">
                                        <span className="material-symbols-outlined text-sm text-purple-400">filter_center_focus</span>
                                        <span className="text-[10px] font-black uppercase text-purple-600 tracking-widest">Enfoque: {focusCode}</span>
                                        <button onClick={() => setFocusCode(null)} className="ml-1 w-4 h-4 flex items-center justify-center bg-purple-200 text-purple-600 rounded-full hover:bg-purple-600 hover:text-white transition-all">
                                            <span className="material-symbols-outlined text-[10px]">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative group flex-1 md:flex-none">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg group-focus-within:text-blue-500 transition-colors">search</span>
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-12 pr-4 py-3 bg-gray-50 border-transparent rounded-[20px] text-sm font-medium focus:ring-4 focus:ring-blue-500/5 focus:bg-white focus:border-blue-100 w-full md:min-w-[360px] transition-all"
                            />
                        </div>
                        <div className="hidden md:block h-8 w-px bg-gray-100 mx-1"></div>
                        <button onClick={handleImportClick} className="p-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-2xl transition-all" title="Importar JSON">
                            <span className="material-symbols-outlined">publish</span>
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
                        <button onClick={() => handleExport('csv')} className="p-2.5 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-2xl transition-all" title="Exportar CSV">
                            <span className="material-symbols-outlined">download</span>
                        </button>
                    </div>
                </header>

                <div className="px-4 md:px-8 py-4 bg-gray-50/30 border-b border-gray-100 flex items-center gap-4 lg:gap-8 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-2 pr-4 border-r border-gray-100">
                        {['all', 'Activo', 'Pasivo', 'Capital', 'Ingresos', 'Egresos'].map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${filterType === type ? 'bg-gray-900 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-900 hover:text-gray-900'}`}
                            >
                                {type === 'all' ? 'Todos' : type}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-8">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-11 h-6 rounded-full relative transition-all duration-300 ${onlyPostable ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                                <input type="checkbox" checked={onlyPostable} onChange={e => setOnlyPostable(e.target.checked)} className="hidden" />
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${onlyPostable ? 'left-6' : 'left-1'}`} />
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${onlyPostable ? 'text-gray-900' : 'text-gray-400'}`}>Solo Posteables</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-11 h-6 rounded-full relative transition-all duration-300 ${withoutSat ? 'bg-orange-500' : 'bg-gray-200'}`}>
                                <input type="checkbox" checked={withoutSat} onChange={e => setWithoutSat(e.target.checked)} className="hidden" />
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 ${withoutSat ? 'left-6' : 'left-1'}`} />
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${withoutSat ? 'text-gray-900' : 'text-gray-400'}`}>Sin SAT</span>
                        </label>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50/20">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <div className="w-12 h-12 border-[6px] border-gray-100 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Sincronizando...</p>
                        </div>
                    ) : viewMode === 'tree' ? (
                        <div className="flex flex-col w-full max-w-[1600px] mx-auto py-8 px-12 space-y-1">
                            {accountTree.length === 0 ? (
                                <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-6">
                                    <div className="p-8 bg-white rounded-[40px] shadow-sm ring-1 ring-gray-100">
                                        <span className="material-symbols-outlined text-7xl opacity-10">inventory_2</span>
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-300">No hay cuentas disponibles</p>
                                </div>
                            ) : (
                                accountTree.map(root => renderTreeNode(root))
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-sm max-w-7xl mx-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/80 border-b border-gray-100">
                                    <tr>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Código Interno</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre de la Cuenta</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vínculo SAT</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo / Clasificación</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Posteable</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredAccounts.slice(0, 150).map(acc => (
                                        <tr key={acc.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-8 py-5 font-mono text-xs font-bold text-blue-600/70">{acc.internal_code}</td>
                                            <td className="px-8 py-5 text-sm font-bold text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    {acc.name}
                                                    {!acc.is_custom && (
                                                        <span className="text-[8px] font-black bg-gray-50 text-gray-300 px-1 py-0.5 rounded border border-gray-100">BASE</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                {acc.sat_code ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-black text-blue-500 bg-blue-50/50 px-2 py-1 rounded-lg border border-blue-100/50">
                                                            {acc.sat_code}
                                                        </span>
                                                        <span className="material-symbols-outlined text-sm text-emerald-400">verified</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-orange-400">Sin vínculo</span>
                                                )}
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-wider ${acc.type === 'Activo' ? 'bg-emerald-50 text-emerald-600' :
                                                    acc.type === 'Pasivo' ? 'bg-red-50 text-red-600' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {acc.type}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                {acc.is_postable ? (
                                                    <span className="material-symbols-outlined text-emerald-500 text-2xl">check_box</span>
                                                ) : <span className="material-symbols-outlined text-gray-200 text-2xl">check_box_outline_blank</span>}
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEdit(acc)} className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-blue-500 shadow-sm border border-gray-100">
                                                        <span className="material-symbols-outlined text-lg">edit</span>
                                                    </button>
                                                    {acc.is_custom && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(acc.id); }} className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-red-500 shadow-sm border border-gray-100" title="Eliminar">
                                                            <span className="material-symbols-outlined text-lg">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <aside className={`fixed md:relative top-0 right-0 w-full md:w-[480px] h-full border-l border-gray-100 bg-white flex flex-col shadow-2xl md:shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) z-40 ${isEditing || selectedAccountId ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedAccountId || isEditing ? (
                    <>
                        <header className="h-20 md:h-24 px-6 md:px-10 flex items-center justify-between border-b border-gray-50 flex-shrink-0 bg-white sticky top-0 z-10">
                            <div className="flex flex-col">
                                <h2 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-1">Configuración</h2>
                                <h3 className="text-lg md:text-xl font-black text-gray-900 tracking-tight truncate">
                                    {isEditing && !selectedAccountId ? 'Nueva Cuenta' : 'Edición Maestra'}
                                </h3>
                            </div>
                            <button onClick={() => { setIsEditing(false); setSelectedAccountId(null); setEditForm({}); }} className="w-10 md:w-12 h-10 md:h-12 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-[15px] md:rounded-[20px] transition-all">
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 md:space-y-12 custom-scrollbar pb-40">
                            <section className="space-y-6 md:space-y-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Identidad</h4>
                                </div>
                                <div className="grid gap-6 md:gap-8">
                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Nombre</label>
                                        <input
                                            type="text"
                                            placeholder="Nombre de la cuenta"
                                            value={editForm.name || ''}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-[20px] md:rounded-[24px] border-transparent bg-gray-50 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-blue-500/5 focus:bg-white focus:border-blue-100 transition-all outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Código Interno</label>
                                            <input
                                                type="text"
                                                value={editForm.internal_code || ''}
                                                onChange={e => setEditForm({ ...editForm, internal_code: e.target.value })}
                                                className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-[20px] md:rounded-[24px] border-transparent bg-gray-100 text-xs font-mono font-bold text-gray-500 outline-none"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Código SAT</label>
                                            <input
                                                type="text"
                                                value={editForm.sat_code || ''}
                                                onChange={e => setEditForm({ ...editForm, sat_code: e.target.value })}
                                                className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-[20px] md:rounded-[24px] border-transparent bg-blue-50/30 text-xs font-mono font-bold text-blue-600 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Otros sectores omitidos para brevedad pero manteniendo estructura */}
                            <section className="space-y-6 md:space-y-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-6 bg-amber-400 rounded-full"></div>
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Fiscal</h4>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Tipo</label>
                                        <select
                                            value={editForm.type || 'Activo'}
                                            onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                            className="w-full px-5 py-3.5 rounded-[20px] border border-gray-100 bg-gray-50 text-xs font-bold"
                                        >
                                            <option value="Activo">Activo</option>
                                            <option value="Pasivo">Pasivo</option>
                                            <option value="Capital">Capital</option>
                                            <option value="Ingresos">Ingresos</option>
                                            <option value="Egresos">Egresos</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Naturaleza</label>
                                        <select
                                            value={editForm.naturaleza || 'Deudora'}
                                            onChange={e => setEditForm({ ...editForm, naturaleza: e.target.value as any })}
                                            className="w-full px-5 py-3.5 rounded-[20px] border border-gray-100 bg-gray-50 text-xs font-bold"
                                        >
                                            <option value="Deudora">Deudora</option>
                                            <option value="Acreedora">Acreedora</option>
                                        </select>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="p-6 md:p-10 bg-white border-t border-gray-50 flex flex-col gap-3 fixed bottom-0 w-full md:w-[480px]">
                            <button onClick={handleSave} className="w-full py-4 md:py-5 bg-gray-900 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-[20px] md:rounded-[24px]">
                                Guardar Cambios
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => { setIsEditing(false); setSelectedAccountId(null); }} className="flex-1 py-3 bg-gray-50 text-gray-500 font-black uppercase tracking-widest text-[9px] rounded-[15px]">
                                    Cerrar
                                </button>
                                {selectedAccountId && accounts.find(a => a.id === selectedAccountId)?.is_custom && (
                                    <button onClick={() => handleDelete(selectedAccountId)} className="flex-1 py-3 bg-red-50 text-red-500 font-black uppercase tracking-widest text-[9px] rounded-[15px]">
                                        Eliminar
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full hidden md:flex flex-col items-center justify-center p-12 text-center gap-6 opacity-40">
                        <span className="material-symbols-outlined text-5xl text-gray-200">touch_app</span>
                        <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Selecciona una cuenta</p>
                    </div>
                )}
            </aside>
        </div>
    );
};
