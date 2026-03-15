import { useState, useEffect, useRef } from 'react';
import {
    listPolizas, listPolizaTemplates, preCheckPolizas, generatePolizas,
    exportPolizas, deletePoliza, saveRfcMap, saveBankMap, listAccounts,
    authFetch,
} from '../services';
import type { Poliza, PolizaTemplate, Account, BankMovement, MissingAccounts } from '../models';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIPO_LABEL: Record<number, string> = { 1: 'Ingreso', 2: 'Egreso', 3: 'Diario' };
const TIPO_COLOR: Record<number, string> = {
    1: 'bg-emerald-100 text-emerald-700',
    2: 'bg-red-100 text-red-700',
    3: 'bg-blue-100 text-blue-700',
};

// ─── Account Picker ───────────────────────────────────────────────────────────

function AccountPicker({
    accounts, value, onChange, placeholder = 'Buscar cuenta...',
}: {
    accounts: Account[]; value: number | null;
    onChange: (id: number, account: Account) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selected = accounts.find(a => a.id === value);

    const filtered = query.length < 2
        ? []
        : accounts.filter(a =>
            a.is_postable &&
            (a.internal_code.toLowerCase().includes(query.toLowerCase()) ||
             a.name.toLowerCase().includes(query.toLowerCase()))
          ).slice(0, 20);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <div
                className="border border-gray-200 rounded-xl px-3 py-2 cursor-text bg-white flex items-center gap-2 min-h-[40px]"
                onClick={() => setOpen(true)}
            >
                {selected ? (
                    <span className="flex-1 text-sm text-gray-800">
                        <span className="font-mono text-xs text-gray-500 mr-2">{selected.internal_code}</span>
                        {selected.name}
                    </span>
                ) : (
                    <span className="flex-1 text-sm text-gray-400">{placeholder}</span>
                )}
                <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
            </div>
            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl">
                    <input
                        autoFocus
                        className="w-full px-3 py-2 text-sm border-b border-gray-100 rounded-t-xl outline-none"
                        placeholder="Código o nombre..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 && query.length >= 2 && (
                            <p className="text-xs text-gray-400 px-3 py-3 text-center">Sin resultados</p>
                        )}
                        {query.length < 2 && (
                            <p className="text-xs text-gray-400 px-3 py-3 text-center">Escribe 2+ caracteres</p>
                        )}
                        {filtered.map(a => (
                            <button
                                key={a.id}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                                onMouseDown={() => { onChange(a.id, a); setQuery(''); setOpen(false); }}
                            >
                                <span className="font-mono text-xs text-gray-400 w-20 flex-shrink-0">{a.internal_code}</span>
                                <span className="truncate text-gray-800">{a.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Missing Accounts Dialog ──────────────────────────────────────────────────

function MissingAccountsDialog({
    missing, rfc, accounts, onSaved, onCancel,
}: {
    missing: MissingAccounts; rfc: string; accounts: Account[];
    onSaved: () => void; onCancel: () => void;
}) {
    const [rfcMaps, setRfcMaps] = useState<Record<string, number | null>>(
        Object.fromEntries(missing.missing_rfcs.map(r => [r.rfc, null]))
    );
    const [bankMaps, setBankMaps] = useState<Record<string, number | null>>(
        Object.fromEntries(missing.missing_banks.map(b => [`${b.bank_name}_${b.account_number}`, null]))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const allDone = (
        Object.values(rfcMaps).every(v => v !== null) &&
        Object.values(bankMaps).every(v => v !== null)
    );

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            for (const r of missing.missing_rfcs) {
                if (rfcMaps[r.rfc]) {
                    await saveRfcMap(rfc, { rfc: r.rfc, nombre: r.nombre, account_id: rfcMaps[r.rfc]! });
                }
            }
            for (const b of missing.missing_banks) {
                const key = `${b.bank_name}_${b.account_number}`;
                if (bankMaps[key]) {
                    await saveBankMap(rfc, {
                        bank_statement_id: b.statement_id,
                        bank_name: b.bank_name,
                        account_number: b.account_number,
                        account_id: bankMaps[key]!,
                    });
                }
            }
            onSaved();
        } catch (e: any) {
            setError(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-500 text-2xl">warning</span>
                        <div>
                            <h2 className="font-semibold text-gray-900">Cuentas contables requeridas</h2>
                            <p className="text-sm text-gray-500">Asigna una cuenta a cada RFC/banco antes de generar</p>
                        </div>
                    </div>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {missing.missing_rfcs.map(r => (
                        <div key={r.rfc} className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">
                                RFC: <span className="font-mono text-indigo-600">{r.rfc}</span>
                                {r.nombre && <span className="text-gray-500 font-normal"> — {r.nombre}</span>}
                            </label>
                            <AccountPicker
                                accounts={accounts}
                                value={rfcMaps[r.rfc] ?? null}
                                onChange={(id) => setRfcMaps(prev => ({ ...prev, [r.rfc]: id }))}
                                placeholder="Cuenta por cobrar / por pagar..."
                            />
                        </div>
                    ))}
                    {missing.missing_banks.map(b => {
                        const key = `${b.bank_name}_${b.account_number}`;
                        return (
                            <div key={key} className="space-y-1">
                                <label className="text-sm font-medium text-gray-700">
                                    Banco: <span className="font-mono text-indigo-600">{b.bank_name}</span>
                                    <span className="text-gray-500 font-normal"> *{b.account_number?.slice(-4)}</span>
                                </label>
                                <AccountPicker
                                    accounts={accounts}
                                    value={bankMaps[key] ?? null}
                                    onChange={(id) => setBankMaps(prev => ({ ...prev, [key]: id }))}
                                    placeholder="Cuenta bancaria..."
                                />
                            </div>
                        );
                    })}
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                </div>
                <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!allDone || saving}
                        className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition"
                    >
                        {saving ? 'Guardando...' : 'Guardar y continuar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Generate Panel ───────────────────────────────────────────────────────────

function GeneratePanel({
    rfc, templates, accounts, onGenerated,
}: {
    rfc: string; templates: PolizaTemplate[]; accounts: Account[];
    onGenerated: () => void;
}) {
    const [selectedTemplate, setSelectedTemplate] = useState<PolizaTemplate | null>(null);
    const [movements, setMovements] = useState<BankMovement[]>([]);
    const [cfdis, setCfdis] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [generating, setGenerating] = useState(false);
    const [missing, setMissing] = useState<MissingAccounts | null>(null);
    const [result, setResult] = useState<{ generated: Poliza[]; errors: any[] } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!selectedTemplate) return;
        setSelectedIds(new Set());
        setResult(null);
        setError('');
        loadItems();
    }, [selectedTemplate]);

    const loadItems = async () => {
        if (!selectedTemplate) return;
        setLoadingItems(true);
        try {
            if (selectedTemplate.trigger_type === 'movement') {
                // Load reconciled movements without a poliza
                const res = await authFetch(`/api/bank-statements?rfc=${encodeURIComponent(rfc)}`);
                const data = await res.json();
                // Flatten movements with poliza_id == null (we'll filter client-side if needed)
                const stmts: any[] = Array.isArray(data) ? data : (data.data ?? []);
                // Collect all reconciled movements
                const allMovs: BankMovement[] = [];
                for (const stmt of stmts) {
                    const r2 = await authFetch(`/api/reconciliation/suggest/${stmt.id}?rfc=${encodeURIComponent(rfc)}`);
                    const d2 = await r2.json();
                    const reconciled = (d2.movements ?? []).filter(
                        (m: BankMovement) => m.cfdi_id || (m.cfdis && m.cfdis.length > 0)
                    );
                    allMovs.push(...reconciled);
                }
                setMovements(allMovs);
                setCfdis([]);
            } else {
                // trigger_type === 'cfdi' — load emitted CFDIs matching cfdi_tipo
                const tipo = selectedTemplate.cfdi_tipo ?? 'I';
                const res = await authFetch(
                    `/api/cfdis?rfc=${encodeURIComponent(rfc)}&tipo=${tipo}&role=emitidas&per_page=200`
                );
                const d = await res.json();
                setCfdis(d.data ?? []);
                setMovements([]);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoadingItems(false);
        }
    };

    const toggleId = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const allIds = selectedTemplate?.trigger_type === 'movement'
            ? movements.map(m => m.id)
            : cfdis.map(c => c.id);
        if (selectedIds.size === allIds.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(allIds));
    };

    const buildItems = () => {
        if (!selectedTemplate) return [];
        if (selectedTemplate.trigger_type === 'movement') {
            return movements
                .filter(m => selectedIds.has(m.id))
                .map(m => ({
                    movement_id: m.id,
                    cfdi_id: m.cfdi_id ?? m.cfdis?.[0]?.id ?? null,
                    template_id: selectedTemplate.id,
                }));
        }
        return cfdis
            .filter(c => selectedIds.has(c.id))
            .map(c => ({ cfdi_id: c.id, template_id: selectedTemplate!.id }));
    };

    const handlePreCheck = async () => {
        setError('');
        setResult(null);
        const items = buildItems();
        if (!items.length) { setError('Selecciona al menos un elemento'); return; }
        setGenerating(true);
        try {
            const check = await preCheckPolizas(rfc, items);
            if (check.missing_rfcs.length > 0 || check.missing_banks.length > 0) {
                setMissing(check);
            } else {
                await doGenerate(items);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const doGenerate = async (items: any[]) => {
        setGenerating(true);
        try {
            const res = await generatePolizas(rfc, items);
            setResult(res);
            setSelectedIds(new Set());
            onGenerated();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const items = selectedTemplate?.trigger_type === 'movement' ? movements : cfdis;
    const isMovement = selectedTemplate?.trigger_type === 'movement';

    return (
        <div className="flex flex-col gap-4">
            {/* Template picker */}
            <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Plantilla de póliza</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {templates.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(t)}
                            className={`text-left p-3 rounded-xl border-2 transition-all ${
                                selectedTemplate?.id === t.id
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-100 bg-white hover:border-indigo-200'
                            }`}
                        >
                            <div className="font-medium text-sm text-gray-900">{t.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_COLOR[t.tipo_poliza]}`}>
                                    {TIPO_LABEL[t.tipo_poliza]}
                                </span>
                                <span>{t.trigger_type === 'cfdi' ? 'Desde CFDI' : 'Desde movimiento'}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {selectedTemplate && (
                <>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">
                            {isMovement ? 'Movimientos conciliados' : `CFDIs tipo ${selectedTemplate.cfdi_tipo}`}
                            {items.length > 0 && <span className="ml-2 text-gray-400 font-normal">({items.length})</span>}
                        </h3>
                        {items.length > 0 && (
                            <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
                                {selectedIds.size === items.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                            </button>
                        )}
                    </div>

                    {loadingItems ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                            No hay elementos disponibles para esta plantilla
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                            {isMovement ? movements.map(m => (
                                <label
                                    key={m.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(m.id)}
                                        onChange={() => toggleId(m.id)}
                                        className="rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">{m.description}</div>
                                        <div className="text-xs text-gray-400">{m.date}</div>
                                    </div>
                                    <div className="text-sm font-semibold tabular-nums text-right">
                                        {m.abono > 0
                                            ? <span className="text-emerald-600">+{fmt(m.abono)}</span>
                                            : <span className="text-red-500">-{fmt(m.cargo)}</span>
                                        }
                                    </div>
                                </label>
                            )) : cfdis.map((c: any) => (
                                <label
                                    key={c.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(c.id)}
                                        onChange={() => toggleId(c.id)}
                                        className="rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">
                                            {c.name_receptor || c.rfc_receptor}
                                        </div>
                                        <div className="text-xs text-gray-400 font-mono truncate">{c.uuid}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold tabular-nums text-emerald-600">{fmt(c.total)}</div>
                                        <div className="text-xs text-gray-400">{c.fecha?.slice(0, 10)}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

                    {result && (
                        <div className={`rounded-xl p-3 text-sm ${result.errors.length ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                            <p className="font-semibold text-gray-800">
                                {result.generated.length} póliza(s) generada(s)
                                {result.errors.length > 0 && `, ${result.errors.length} con error`}
                            </p>
                            {result.errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-600 mt-1">{e.message}</p>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handlePreCheck}
                        disabled={selectedIds.size === 0 || generating}
                        className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition flex items-center justify-center gap-2"
                    >
                        {generating ? (
                            <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Generando...</>
                        ) : (
                            <><span className="material-symbols-outlined text-lg">add</span> Generar {selectedIds.size > 0 ? `${selectedIds.size} póliza(s)` : 'pólizas'}</>
                        )}
                    </button>
                </>
            )}

            {missing && (
                <MissingAccountsDialog
                    missing={missing}
                    rfc={rfc}
                    accounts={accounts}
                    onSaved={() => {
                        setMissing(null);
                        doGenerate(buildItems());
                    }}
                    onCancel={() => setMissing(null)}
                />
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PolizasPage({ activeRfc, clientName }: { activeRfc: string; clientName?: string }) {
    const currentYear = new Date().getFullYear();
    const [tab, setTab] = useState<'list' | 'generate'>('list');
    const [year, setYear] = useState(currentYear);
    const [month, setMonth] = useState<number | ''>('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'exported'>('all');

    const [polizas, setPolizas] = useState<Poliza[]>([]);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState<PolizaTemplate[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
        if (activeRfc) {
            loadPolizas();
            loadTemplates();
            loadAccounts();
        }
    }, [activeRfc, year, month, statusFilter]);

    const loadPolizas = async () => {
        setLoading(true);
        try {
            const data = await listPolizas({
                rfc: activeRfc,
                year,
                month: month !== '' ? month : undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
            });
            setPolizas(data.data ?? data);
        } catch {
            setPolizas([]);
        } finally {
            setLoading(false);
        }
    };

    const loadTemplates = async () => {
        try {
            const data = await listPolizaTemplates(activeRfc);
            setTemplates(data);
        } catch {}
    };

    const loadAccounts = async () => {
        try {
            const data = await listAccounts(activeRfc);
            setAccounts(data);
        } catch {}
    };

    const toggleSelect = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === polizas.length) setSelected(new Set());
        else setSelected(new Set(polizas.map(p => p.id)));
    };

    const handleExport = async () => {
        if (selected.size === 0) return;
        setExporting(true);
        try {
            const blob = await exportPolizas(activeRfc, Array.from(selected));
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `polizas_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            await loadPolizas();
            setSelected(new Set());
        } catch (e: any) {
            alert(e.message);
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('¿Eliminar esta póliza?')) return;
        setDeleting(id);
        try {
            await deletePoliza(activeRfc, id);
            setPolizas(prev => prev.filter(p => p.id !== id));
            setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
        } catch (e: any) {
            alert(e.message);
        } finally {
            setDeleting(null);
        }
    };

    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl text-indigo-600">description</span>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Pólizas</h1>
                            {clientName && <p className="text-sm text-gray-400">{clientName}</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Filters */}
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                        >
                            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>

                        <select
                            value={month}
                            onChange={e => setMonth(e.target.value === '' ? '' : Number(e.target.value))}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                        >
                            <option value="">Todo el año</option>
                            {months.map((m, i) => (
                                <option key={i + 1} value={i + 1}>{m}</option>
                            ))}
                        </select>

                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as any)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                        >
                            <option value="all">Todos los estados</option>
                            <option value="draft">Borrador</option>
                            <option value="exported">Exportadas</option>
                        </select>

                        {selected.size > 0 && (
                            <button
                                onClick={handleExport}
                                disabled={exporting}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition"
                            >
                                {exporting
                                    ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Exportando...</>
                                    : <><span className="material-symbols-outlined text-lg">download</span> Exportar TXT ({selected.size})</>
                                }
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                    {(['list', 'generate'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
                                tab === t ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            {t === 'list' ? 'Pólizas generadas' : 'Generar pólizas'}
                        </button>
                    ))}
                </div>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
                {tab === 'generate' ? (
                    <div className="max-w-2xl mx-auto">
                        <GeneratePanel
                            rfc={activeRfc}
                            templates={templates}
                            accounts={accounts}
                            onGenerated={() => { loadPolizas(); setTab('list'); }}
                        />
                    </div>
                ) : (
                    <>
                        {loading ? (
                            <div className="flex justify-center py-20">
                                <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
                            </div>
                        ) : polizas.length === 0 ? (
                            <div className="text-center py-20 text-gray-400">
                                <span className="material-symbols-outlined text-5xl mb-3 block">description</span>
                                <p className="text-lg font-medium">Sin pólizas</p>
                                <p className="text-sm mt-1">Genera pólizas desde la pestaña "Generar pólizas"</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                {/* Table header */}
                                <div className="grid grid-cols-[32px_80px_60px_1fr_120px_100px_80px] gap-3 px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    <input
                                        type="checkbox"
                                        checked={selected.size === polizas.length && polizas.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded"
                                    />
                                    <span>Fecha</span>
                                    <span>Tipo</span>
                                    <span>Concepto</span>
                                    <span>Plantilla</span>
                                    <span className="text-right">Importe</span>
                                    <span>Estado</span>
                                </div>

                                {polizas.map(p => {
                                    const total = p.lines?.reduce((s, l) => s + (l.tipo_movto === 0 ? l.importe : 0), 0) ?? 0;
                                    const isExpanded = expandedId === p.id;
                                    return (
                                        <div key={p.id} className="border-b border-gray-50 last:border-b-0">
                                            <div className="grid grid-cols-[32px_80px_60px_1fr_120px_100px_80px] gap-3 px-4 py-3 hover:bg-gray-50 items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(p.id)}
                                                    onChange={() => toggleSelect(p.id)}
                                                    className="rounded"
                                                />
                                                <span className="text-sm text-gray-600 tabular-nums">{p.fecha}</span>
                                                <span className={`text-xs font-semibold px-2 py-1 rounded-lg text-center ${TIPO_COLOR[p.tipo_poliza]}`}>
                                                    {p.numero}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-sm text-gray-900 truncate">{p.concepto}</p>
                                                    {p.template && (
                                                        <p className="text-xs text-gray-400 truncate">{p.template.name}</p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-500 truncate">
                                                    {TIPO_LABEL[p.tipo_poliza]}
                                                </span>
                                                <span className="text-sm font-semibold tabular-nums text-right text-gray-800">
                                                    {fmt(total)}
                                                </span>
                                                <div className="flex items-center gap-1 justify-end">
                                                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                                                        p.status === 'exported' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                        {p.status === 'exported' ? 'Export.' : 'Borrador'}
                                                    </span>
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                                                        className="p-1 text-gray-400 hover:text-gray-600 transition"
                                                        title="Ver líneas"
                                                    >
                                                        <span className={`material-symbols-outlined text-lg transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                            expand_more
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(p.id)}
                                                        disabled={deleting === p.id}
                                                        className="p-1 text-gray-300 hover:text-red-500 transition"
                                                        title="Eliminar"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">
                                                            {deleting === p.id ? 'hourglass_empty' : 'delete'}
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded lines */}
                                            {isExpanded && p.lines && p.lines.length > 0 && (
                                                <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-gray-400 uppercase tracking-wider">
                                                                <th className="text-left pb-2 font-semibold">Cuenta</th>
                                                                <th className="text-left pb-2 font-semibold">Concepto</th>
                                                                <th className="text-center pb-2 font-semibold">Tipo</th>
                                                                <th className="text-right pb-2 font-semibold">Importe</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {p.lines.map((l, i) => (
                                                                <tr key={i} className="text-gray-700">
                                                                    <td className="py-1.5 font-mono text-indigo-600">
                                                                        {l.account?.internal_code ?? '-'}
                                                                        <span className="ml-2 font-sans text-gray-600">{l.account?.name}</span>
                                                                    </td>
                                                                    <td className="py-1.5 text-gray-500 truncate max-w-[200px]">{l.concepto ?? '-'}</td>
                                                                    <td className="py-1.5 text-center">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${l.tipo_movto === 0 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                                            {l.tipo_movto === 0 ? 'Cargo' : 'Abono'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(l.importe)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
