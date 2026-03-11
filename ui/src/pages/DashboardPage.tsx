
import React, { useState, useEffect, useMemo } from 'react';
import { parseCertificate, createClient, logout, getRunnerStatus, getMissingDocs } from '../services';
import { listGroups, createGroup, updateGroup, deleteGroup } from '../api/groups';
import { listTags, createTag, updateTag, deleteTag } from '../api/tags';
import { listClients, updateClientGroup, updateClientTags, updateClientInfo, deleteClient, updateClientFiel } from '../api/clients';
import { GroupCardsRow } from '../components/GroupCardsRow';
import { TagsFilter } from '../components/TagsFilter';
import { GroupByToggle } from '../components/GroupByToggle';
import type { GroupByMode } from '../components/GroupByToggle';
import { ClientCard } from '../components/ClientCard';
import { RecentRequests } from '../components/RecentRequests';

export const DashboardPage = ({
    onSelectClient,
    onViewHistory,
    onViewScraper
}: {
    onSelectClient: (rfc: string, name: string, lastSyncAt: string, validUntil: string) => void,
    onViewHistory: () => void,
    onViewScraper: () => void
}) => {
    // Data states
    const [clients, setClients] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [totalSystemClients, setTotalSystemClients] = useState(0);
    const [missingDocs, setMissingDocs] = useState<{ missing_csf: any[], missing_opinion: any[], negative_opinions: any[] }>({ missing_csf: [], missing_opinion: [], negative_opinions: [] });

    // UI states
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isManageGroupsOpen, setIsManageGroupsOpen] = useState(false);
    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // Filter states (Persisted)
    const [search, setSearch] = useState(localStorage.getItem('dash_search') || '');
    const [selectedGroupId, setSelectedGroupId] = useState<string | number>(localStorage.getItem('dash_group_id') || 'all');
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>(JSON.parse(localStorage.getItem('dash_tag_ids') || '[]'));
    const [groupByMode, setGroupByMode] = useState<GroupByMode>((localStorage.getItem('dash_group_by') as GroupByMode) || 'none');

    // Drawer form state
    const [alias, setAlias] = useState('');
    const [rfc, setRfc] = useState('');
    const [cerFile, setCerFile] = useState<File | null>(null);
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const [keyPass, setKeyPass] = useState('');
    const [ciec, setCiec] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showKeyPass, setShowKeyPass] = useState(false);
    const [showCiec, setShowCiec] = useState(false);

    // FIEL update states (edit mode only)
    const [fielCerFile, setFielCerFile] = useState<File | null>(null);
    const [fielKeyFile, setFielKeyFile] = useState<File | null>(null);
    const [fielPass, setFielPass] = useState('');
    const [showFielPass, setShowFielPass] = useState(false);
    const [fielSubmitting, setFielSubmitting] = useState(false);
    const [fielMessage, setFielMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Group/Tag form state
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupColor, setNewGroupColor] = useState('#10B981');
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3B82F6');
    const [editingEntity, setEditingEntity] = useState<any>(null);

    // Runner status state
    const [runnerStatus, setRunnerStatus] = useState<{ is_alive: boolean; last_activity: string | null }>({ is_alive: false, last_activity: null });
    const [nowTick, setNowTick] = useState(Date.now());
    const [mobileTab, setMobileTab] = useState<'home' | 'clients' | 'settings'>('home');
    const [expandRisks, setExpandRisks] = useState(false);

    useEffect(() => {
        loadInitialData();
        fetchRunnerStatus();

        const tickInterval = setInterval(() => {
            setNowTick(Date.now());
        }, 30000);

        const runnerInterval = setInterval(() => {
            fetchRunnerStatus();
        }, 60000); // Poll status every 1 min

        return () => {
            clearInterval(tickInterval);
            clearInterval(runnerInterval);
        };
    }, []);

    const fetchRunnerStatus = async () => {
        try {
            const status = await getRunnerStatus();
            setRunnerStatus(status);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadClientsData();
        // Persist filters
        localStorage.setItem('dash_search', search);
        localStorage.setItem('dash_group_id', String(selectedGroupId));
        localStorage.setItem('dash_tag_ids', JSON.stringify(selectedTagIds));
        localStorage.setItem('dash_group_by', groupByMode);
    }, [search, selectedGroupId, selectedTagIds, groupByMode]);

    const loadInitialData = async () => {
        try {
            const [gRes, tRes, totalRes, missingRes] = await Promise.all([
                listGroups(), listTags(), listClients({ pageSize: 1 }),
                getMissingDocs(),
            ]);
            setGroups(gRes);
            setTags(tRes);
            setTotalSystemClients(totalRes.total || 0);
            setMissingDocs({
                missing_csf: missingRes?.missing_csf ?? [],
                missing_opinion: missingRes?.missing_opinion ?? [],
                negative_opinions: missingRes?.negative_opinions ?? [],
            });

            // Limpiar filtros obsoletos de localStorage que ya no existen en la BD
            const validTagIds = selectedTagIds.filter(id => tRes.some((t: any) => t.id === id));
            if (validTagIds.length !== selectedTagIds.length) {
                setSelectedTagIds(validTagIds);
            }
            if (selectedGroupId !== 'all' && selectedGroupId !== 'null') {
                const groupExists = gRes.some((g: any) => String(g.id) === String(selectedGroupId));
                if (!groupExists) setSelectedGroupId('all');
            }
        } catch (err) {
            console.error("Error loading metadata", err);
        }
    };

    const loadClientsData = async () => {
        try {
            setLoading(true);
            setLoadError(false);
            const res = await listClients({
                q: search,
                group_id: selectedGroupId === 'all' ? undefined : (selectedGroupId === 'null' ? 'null' : selectedGroupId),
                tag_ids: selectedTagIds,
                pageSize: 100 // Load more for grouping
            });
            setClients(res.data || []);
        } catch (err) {
            console.error("Error loading clients", err);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    const handleCerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCerFile(file);
            try {
                const data = await parseCertificate(file);
                if (data.rfc) setRfc(data.rfc);
                if (data.name) setAlias(data.name);
            } catch (err) {
                console.error("Error parsing certificate", err);
            }
        }
    };

    const handleFielUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fielCerFile || !fielKeyFile || !fielPass) {
            setFielMessage({ type: 'error', text: 'Completa los tres campos: .cer, .key y contraseña.' });
            return;
        }
        setFielSubmitting(true);
        setFielMessage(null);
        try {
            const fd = new FormData();
            fd.append('certificate', fielCerFile);
            fd.append('private_key', fielKeyFile);
            fd.append('passphrase', fielPass);
            const res = await updateClientFiel(selectedClient.id, fd);
            setFielMessage({ type: 'success', text: res.message || 'FIEL actualizada.' });
            setFielCerFile(null);
            setFielKeyFile(null);
            setFielPass('');
            loadClientsData();
        } catch (err: any) {
            setFielMessage({ type: 'error', text: err.message || 'Error al actualizar FIEL.' });
        } finally {
            setFielSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isEditMode) {
            if (!alias || !rfc) {
                setErrorMessage('El nombre y RFC son obligatorios.');
                return;
            }
            setSubmitting(true);
            try {
                await updateClientInfo(selectedClient.id, {
                    legal_name: alias,
                    common_name: alias,
                    ciec,
                    passphrase: keyPass
                });
                setIsDrawerOpen(false);
                resetForm();
                loadClientsData();
            } catch (err: any) {
                setErrorMessage(err.message || 'Error al actualizar cliente');
            } finally {
                setSubmitting(false);
            }
            return;
        }

        if (!cerFile || !keyFile || !rfc || !alias || !keyPass) {
            setErrorMessage('Por favor completa todos los campos obligatorios.');
            return;
        }

        setSubmitting(true);
        setErrorMessage('');
        try {
            const formData = new FormData();
            formData.append('rfc', rfc);
            formData.append('legal_name', alias);
            formData.append('certificate', cerFile);
            formData.append('private_key', keyFile);
            formData.append('passphrase', keyPass);
            formData.append('ciec', ciec);

            await createClient(formData);
            setIsDrawerOpen(false);
            resetForm();
            loadClientsData();
            loadInitialData(); // Refresh group counts
        } catch (err: any) {
            setErrorMessage(err.message || 'Error al registrar cliente');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setAlias('');
        setRfc('');
        setCerFile(null);
        setKeyFile(null);
        setKeyPass('');
        setCiec('');
        setErrorMessage('');
        setIsEditMode(false);
        setSelectedClient(null);
        setFielCerFile(null);
        setFielKeyFile(null);
        setFielPass('');
        setFielMessage(null);
    };

    const handleSaveGroup = async () => {
        if (!newGroupName) return;
        try {
            if (editingEntity) {
                await updateGroup(editingEntity.id, newGroupName, newGroupColor);
            } else {
                await createGroup(newGroupName, newGroupColor);
            }
            setNewGroupName('');
            setEditingEntity(null);
            loadInitialData();
            loadClientsData();
        } catch (err) {
            console.error("Error saving group", err);
        }
    };

    const handleDeleteGroup = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar este grupo? Los clientes se quedarán sin grupo.')) return;
        try {
            await deleteGroup(id);
            loadInitialData();
            loadClientsData();
        } catch (err) {
            console.error("Error deleting group", err);
        }
    };

    const handleSaveTag = async () => {
        if (!newTagName) return;
        try {
            if (editingEntity) {
                await updateTag(editingEntity.id, newTagName, newTagColor);
            } else {
                await createTag(newTagName, newTagColor);
            }
            setNewTagName('');
            setEditingEntity(null);
            loadInitialData();
            loadClientsData();
        } catch (err) {
            console.error("Error saving tag", err);
        }
    };

    const handleDeleteTag = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar esta etiqueta?')) return;
        try {
            await deleteTag(id);
            loadInitialData();
            loadClientsData();
        } catch (err) {
            console.error("Error deleting tag", err);
        }
    };

    const handleDeleteClient = async () => {
        if (!selectedClient) return;
        if (!confirm(`¿Estás seguro de eliminar a ${selectedClient.legal_name}? Esta acción no se puede deshacer.`)) return;
        try {
            await deleteClient(selectedClient.id);
            setIsDrawerOpen(false);
            resetForm();
            loadClientsData();
        } catch (err) {
            console.error("Error deleting client", err);
        }
    };

    // Grouping logic
    const groupedClients = useMemo(() => {
        if (groupByMode === 'none') {
            return [{ title: 'Todos los clientes', items: clients }];
        }

        const groupsMap: { [key: string]: any[] } = {};

        clients.forEach(client => {
            let key = 'Otros / Sin asignar';

            if (groupByMode === 'group') {
                key = client.group?.name || 'Sin grupo';
            } else if (groupByMode === 'regimen') {
                const regimenTag = client.tags?.find((t: any) => ['PM', 'RESICO', 'PF'].includes(t.name.toUpperCase()));
                key = regimenTag ? regimenTag.name : 'Sin régimen';
            } else if (groupByMode === 'sector') {
                const sectorTag = client.tags?.find((t: any) => t.name.startsWith('Sector:'));
                key = sectorTag ? sectorTag.name.replace('Sector:', '').trim() : 'Sin sector';
            }

            if (!groupsMap[key]) groupsMap[key] = [];
            groupsMap[key].push(client);
        });

        return Object.keys(groupsMap).sort().map(key => ({
            title: key,
            items: groupsMap[key]
        }));
    }, [clients, groupByMode]);

    // Risks calculation
    const fielRisks = useMemo(() => {
        const expiredClients: any[] = [];
        const expiringSoonClients: any[] = [];
        const nowMs = Date.now();
        clients.forEach(c => {
            if (c.valid_until) {
                const validMs = new Date(c.valid_until.replace(" ", "T")).getTime();
                const diffDays = Math.ceil((validMs - nowMs) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    expiredClients.push({ ...c, diffDays });
                } else if (diffDays <= 30) {
                    expiringSoonClients.push({ ...c, diffDays });
                }
            }
        });
        return { expiredClients, expiringSoonClients };
    }, [clients]);

    return (
        <div className="flex h-screen bg-[#F9FAFB] font-['Inter'] overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="hidden md:flex w-20 lg:w-24 flex-shrink-0 flex-col items-center py-8 bg-white border-r border-gray-100 z-20">
                <div className="mb-10 cursor-pointer flex justify-center w-full">
                    <img src="/img/fiscalio-logo.png" alt="Fiscalio Logo" className="w-12 h-12 object-contain" />
                </div>
                <nav className="flex flex-col gap-8 w-full items-center">
                    <button className="p-3 rounded-2xl bg-emerald-50 text-[#10B981] transition-all">
                        <span className="material-symbols-outlined">dashboard</span>
                    </button>
                    <button onClick={onViewHistory} title="Historial SAT" className="p-3 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all">
                        <span className="material-symbols-outlined">history</span>
                    </button>
                    <button onClick={onViewScraper} title="Scrapper Manual (Cola)" className="p-3 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all">
                        <span className="material-symbols-outlined">rocket_launch</span>
                    </button>
                    <button className="p-3 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all opacity-40">
                        <span className="material-symbols-outlined">task</span>
                    </button>
                </nav>
                <div className="mt-auto pt-8">
                    <button onClick={logout} title="Cerrar sesión" className="p-3 rounded-2xl text-red-400 hover:bg-red-50 hover:text-red-500 transition-all">
                        <span className="material-symbols-outlined">logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Mobile Header */}
                <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <img src="/img/fiscalio-logo.png" className="w-8 h-8 object-contain" alt="Fiscalio" />
                        <span className="text-sm font-bold text-gray-900">Fiscalio</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${runnerStatus.is_alive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full bg-current ${runnerStatus.is_alive ? 'animate-pulse' : ''}`} />
                            SAT {runnerStatus.is_alive ? 'ACTIVO' : 'INACTIVO'}
                        </div>
                        <button onClick={() => setMobileTab('clients')} className="p-2 text-gray-400">
                            <span className="material-symbols-outlined text-xl">search</span>
                        </button>
                    </div>
                </header>
                {/* Desktop Header */}
                <div className="hidden md:block flex-shrink-0">
                <header className="bg-white border-b border-gray-100 z-10 sticky top-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between px-6 lg:px-10 py-4 md:h-20 gap-4">
                        <div className="flex items-center justify-between md:justify-start gap-4 lg:gap-6">
                            <h1 className="text-lg lg:text-xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                            <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 ${runnerStatus.is_alive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} rounded-full text-[10px] lg:text-xs font-bold whitespace-nowrap`}>
                                <span className={`h-2 w-2 rounded-full ${runnerStatus.is_alive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                                {(() => {
                                    if (!runnerStatus.last_activity) return 'SAT Sync: Inactivo';
                                    const lastAct = new Date(runnerStatus.last_activity.replace(" ", "T")).getTime();
                                    const now = nowTick;
                                    const diffMins = Math.floor((now - lastAct) / 60000);
                                    const nextMins = 15 - (diffMins % 15);

                                    if (!runnerStatus.is_alive) return `SAT Sync: Caído (hace ${diffMins}m)`;
                                    return `Monitor SAT Activo | Próx. revisión de bloques: ${nextMins}m`;
                                })()}
                            </div>
                        </div>

                        <div className="flex-1 w-full md:max-w-md lg:max-w-xl md:mx-4 relative order-3 md:order-2">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none material-symbols-outlined text-gray-400 text-xl">search</span>
                            <input
                                className="block w-full pl-12 pr-4 py-3 border border-gray-200 rounded-2xl bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] focus:bg-white transition-all text-sm shadow-sm"
                                placeholder="Buscar alias, RFC o razón social..."
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            />

                            {/* Quick Search Results Dropdown */}
                            {isSearchFocused && search.length > 0 && clients.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-2xl z-[100] max-h-[400px] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">Resultados rápidos</span>
                                        <span className="text-[10px] font-medium text-gray-300 pr-2">{clients.length} encontrados</span>
                                    </div>
                                    <div className="overflow-y-auto py-2 no-scrollbar">
                                        {clients.slice(0, 8).map((client) => (
                                            <button
                                                key={client.rfc}
                                                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-emerald-50 transition-colors text-left group"
                                                onClick={() => onSelectClient(client.rfc, client.legal_name, client.last_sync_at || '', client.valid_until || '')}
                                            >
                                                <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                                                    <span className="material-symbols-outlined text-xl">corporate_fare</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-gray-900 truncate">{client.common_name || client.legal_name}</div>
                                                    <div className="text-[10px] font-mono text-gray-400 group-hover:text-emerald-600 transition-colors uppercase">{client.rfc}</div>
                                                </div>
                                                <span className="material-symbols-outlined text-gray-300 group-hover:text-emerald-500 transition-all -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100">arrow_forward</span>
                                            </button>
                                        ))}
                                    </div>
                                    {clients.length > 8 && (
                                        <div className="p-3 text-center border-t border-gray-50">
                                            <p className="text-[10px] font-bold text-gray-400">Escribe más para filtrar mejor...</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setIsDrawerOpen(true)}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#10B981] text-white text-sm font-bold rounded-2xl hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100 whitespace-nowrap order-2 md:order-3"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            Nuevo Cliente
                        </button>
                    </div>

                    <div className="px-6 lg:px-10 py-4 border-t border-gray-50 flex flex-wrap items-center gap-4 lg:gap-8 text-sm">
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:inline text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grupo</span>
                            <div className="flex items-center gap-1">
                                <select
                                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all min-w-[140px] appearance-none cursor-pointer"
                                    value={selectedGroupId}
                                    onChange={(e) => setSelectedGroupId(e.target.value)}
                                >
                                    <option value="all">Todos los grupos</option>
                                    <option value="null">Sin grupo</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                <button
                                    onClick={() => setIsManageGroupsOpen(true)}
                                    className="p-2 text-gray-400 hover:text-[#10B981] hover:bg-emerald-50 rounded-xl transition-all"
                                    title="Configurar Grupos"
                                >
                                    <span className="material-symbols-outlined text-xl">settings</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <GroupByToggle mode={groupByMode} onChange={setGroupByMode} />
                        </div>

                        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                            <span className="hidden sm:inline text-[10px] font-bold text-gray-400 uppercase tracking-widest">Etiquetas</span>
                            <div className="flex items-center gap-1 flex-1">
                                <TagsFilter availableTags={tags} selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
                                <button
                                    onClick={() => setIsManageTagsOpen(true)}
                                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Configurar Etiquetas"
                                >
                                    <span className="material-symbols-outlined text-xl">settings</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>
                </div>
                {/* Desktop Content */}
                <div className="hidden md:flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-10 py-8 space-y-12">
                    {/* Groups Overview Row */}
                    <section>
                        <GroupCardsRow
                            groups={groups}
                            selectedGroupId={selectedGroupId}
                            onSelectGroup={setSelectedGroupId}
                            totalClients={totalSystemClients}
                        />
                    </section>

                    {/* Risk Radar */}
                    <section className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-red-50 rounded-xl">
                                    <span className="material-symbols-outlined text-[#EF4444] text-2xl">shield</span>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Radar de Riesgos Fiscales</h2>
                                {(fielRisks.expiredClients.length > 0 || fielRisks.expiringSoonClients.length > 0) && (
                                    <span className="px-3 py-1 bg-red-50 text-[#EF4444] text-[10px] font-bold uppercase tracking-widest rounded-full">
                                        {fielRisks.expiredClients.length + fielRisks.expiringSoonClients.length} Alertas FIEL
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-8 items-start">
                            <div className={`flex-1 p-6 rounded-3xl border ${fielRisks.expiredClients.length > 0 ? 'border-red-200 bg-red-50' : fielRisks.expiringSoonClients.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-50 bg-gray-50/50'}`}>
                                <h3 className={`font-bold mb-2 ${fielRisks.expiredClients.length > 0 ? 'text-red-700' : fielRisks.expiringSoonClients.length > 0 ? 'text-orange-700' : 'text-gray-400'}`}>Vencimiento FIEL</h3>
                                <div className="text-sm font-medium mt-4 space-y-3">
                                    {fielRisks.expiredClients.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-red-600 font-bold mb-1">Vencidas:</div>
                                            {fielRisks.expiredClients.map(c => (
                                                <div
                                                    key={c.rfc}
                                                    onClick={() => onSelectClient(c.rfc, c.legal_name, c.last_sync_at || '', c.valid_until || '')}
                                                    className="flex items-center justify-between bg-white p-2 rounded-xl border border-red-100 shadow-sm cursor-pointer hover:border-red-300 transition-colors"
                                                >
                                                    <span className="text-gray-800 text-xs truncate max-w-[150px] font-bold">{c.common_name || c.legal_name}</span>
                                                    <span className="text-red-600 text-[10px] font-bold bg-red-50 px-2 py-0.5 rounded">Hace {-c.diffDays} días</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {fielRisks.expiringSoonClients.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-orange-600 font-bold mb-1 mt-4">Vencen pronto (30d):</div>
                                            {fielRisks.expiringSoonClients.map(c => (
                                                <div
                                                    key={c.rfc}
                                                    onClick={() => onSelectClient(c.rfc, c.legal_name, c.last_sync_at || '', c.valid_until || '')}
                                                    className="flex items-center justify-between bg-white p-2 rounded-xl border border-orange-100 shadow-sm cursor-pointer hover:border-orange-300 transition-colors"
                                                >
                                                    <span className="text-gray-800 text-xs truncate max-w-[150px] font-bold">{c.common_name || c.legal_name}</span>
                                                    <span className="text-orange-600 text-[10px] font-bold bg-orange-50 px-2 py-0.5 rounded">En {c.diffDays} d</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {fielRisks.expiredClients.length === 0 && fielRisks.expiringSoonClients.length === 0 && (
                                        <div className="text-gray-500">Todas las FIEL están vigentes.</div>
                                    )}
                                </div>
                            </div>
                            <div className={`flex-1 p-6 rounded-3xl border ${missingDocs.missing_csf.length > 0 || missingDocs.missing_opinion.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-50 bg-gray-50/50'}`}>
                                <h3 className={`font-bold mb-3 ${missingDocs.missing_csf.length > 0 || missingDocs.missing_opinion.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>Documentos SAT</h3>
                                <div className="text-sm font-medium space-y-3">
                                    {missingDocs.missing_csf.length === 0 && missingDocs.missing_opinion.length === 0 ? (
                                        <div className="text-gray-500">Todos tienen CSF y Opinión 32-D.</div>
                                    ) : (
                                        <>
                                            {missingDocs.missing_csf.length > 0 && (
                                                <div className="space-y-1">
                                                    <div className="text-amber-600 font-bold text-xs mb-1">Sin CSF ({missingDocs.missing_csf.length}):</div>
                                                    {missingDocs.missing_csf.slice(0, 5).map((c: any) => (
                                                        <div key={c.rfc} onClick={() => onSelectClient(c.rfc, c.name, '', '')} className="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-100 shadow-sm cursor-pointer hover:border-amber-300 transition-colors">
                                                            <span className="text-gray-800 text-xs truncate max-w-[130px] font-bold">{c.name}</span>
                                                            <span className="text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded">Sin CSF</span>
                                                        </div>
                                                    ))}
                                                    {missingDocs.missing_csf.length > 5 && <div className="text-xs text-amber-500 font-medium">+{missingDocs.missing_csf.length - 5} más</div>}
                                                </div>
                                            )}
                                            {missingDocs.missing_opinion.length > 0 && (
                                                <div className="space-y-1 mt-2">
                                                    <div className="text-orange-600 font-bold text-xs mb-1">Sin Opinión 32-D ({missingDocs.missing_opinion.length}):</div>
                                                    {missingDocs.missing_opinion.slice(0, 3).map((c: any) => (
                                                        <div key={c.rfc} onClick={() => onSelectClient(c.rfc, c.name, '', '')} className="flex items-center justify-between bg-white p-2 rounded-xl border border-orange-100 shadow-sm cursor-pointer hover:border-orange-300 transition-colors">
                                                            <span className="text-gray-800 text-xs truncate max-w-[130px] font-bold">{c.name}</span>
                                                            <span className="text-orange-600 text-[10px] font-bold bg-orange-50 px-2 py-0.5 rounded">Sin Opinión</span>
                                                        </div>
                                                    ))}
                                                    {missingDocs.missing_opinion.length > 3 && <div className="text-xs text-orange-500 font-medium">+{missingDocs.missing_opinion.length - 3} más</div>}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Opiniones Negativas */}
                            <div className={`flex-1 p-6 rounded-3xl border ${missingDocs.negative_opinions.length > 0 ? 'border-red-200 bg-red-50' : 'border-gray-50 bg-gray-50/50'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <h3 className={`font-bold ${missingDocs.negative_opinions.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>Opinión 32-D</h3>
                                    {missingDocs.negative_opinions.length > 0 && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">
                                            {missingDocs.negative_opinions.length} Negativa{missingDocs.negative_opinions.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm font-medium space-y-2">
                                    {missingDocs.negative_opinions.length === 0 ? (
                                        <div className="text-gray-500">Sin opiniones negativas.</div>
                                    ) : (
                                        <>
                                            {missingDocs.negative_opinions.slice(0, 5).map((c: any) => (
                                                <div
                                                    key={c.rfc}
                                                    onClick={() => onSelectClient(c.rfc, c.name, '', '')}
                                                    className="flex items-center justify-between bg-white p-2 rounded-xl border border-red-100 shadow-sm cursor-pointer hover:border-red-300 transition-colors"
                                                >
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-gray-800 text-xs truncate max-w-[130px] font-bold">{c.name}</span>
                                                        <span className="text-gray-400 text-[10px] font-mono">{c.rfc}</span>
                                                    </div>
                                                    <span className="flex items-center gap-1 text-red-700 text-[10px] font-black bg-red-50 px-2 py-0.5 rounded-lg flex-shrink-0">
                                                        <span className="material-symbols-outlined text-[11px]">gpp_bad</span>
                                                        NEGATIVO
                                                    </span>
                                                </div>
                                            ))}
                                            {missingDocs.negative_opinions.length > 5 && (
                                                <div className="text-xs text-red-500 font-medium">+{missingDocs.negative_opinions.length - 5} más</div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 p-6 rounded-3xl border border-gray-50 bg-gray-50/50 opacity-40 grayscale pointer-events-none select-none">
                                <h3 className="font-bold text-gray-400 mb-2">Diferencias IVA</h3>
                                <div className="h-2 w-full bg-gray-200 rounded-full"></div>
                            </div>
                            <div className="flex-1 p-6 rounded-3xl border border-gray-50 bg-gray-50/50 opacity-40 grayscale pointer-events-none select-none">
                                <h3 className="font-bold text-gray-400 mb-2">Buzón Tributario</h3>
                                <div className="h-2 w-full bg-gray-200 rounded-full"></div>
                            </div>
                        </div>
                    </section>

                    {/* Recent Requests Section */}
                    <section>
                        <RecentRequests onViewHistory={onViewHistory} />
                    </section>

                    {/* Clients Grid Section */}
                    <section className="space-y-10">
                        {loading && clients.length === 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="bg-white h-48 rounded-[32px] border border-gray-100 animate-pulse"></div>
                                ))}
                            </div>
                        ) : loadError ? (
                            <div className="text-center py-20 bg-white rounded-[40px] border-2 border-dashed border-red-100">
                                <span className="material-symbols-outlined text-red-200 text-8xl mb-6">cloud_off</span>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Error al cargar clientes</h3>
                                <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm font-medium">No se pudo conectar con el servidor. Los datos están intactos.</p>
                                <button
                                    onClick={loadClientsData}
                                    className="px-6 py-2.5 bg-gray-50 text-gray-600 font-bold rounded-2xl hover:bg-gray-100 transition-all text-sm"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : groupedClients.length === 0 || (groupedClients.length === 1 && groupedClients[0].items.length === 0) ? (
                            <div className="text-center py-20 bg-white rounded-[40px] border-2 border-dashed border-gray-100">
                                <span className="material-symbols-outlined text-gray-200 text-8xl mb-6">person_search</span>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">No se encontraron clientes</h3>
                                <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm font-medium">Prueba a cambiar los filtros o el término de búsqueda.</p>
                                <button
                                    onClick={() => {
                                        setSearch('');
                                        setSelectedGroupId('all');
                                        setSelectedTagIds([]);
                                        setGroupByMode('none');
                                    }}
                                    className="px-6 py-2.5 bg-gray-50 text-gray-600 font-bold rounded-2xl hover:bg-gray-100 transition-all text-sm"
                                >
                                    Limpiar filtros
                                </button>
                            </div>
                        ) : (
                            groupedClients.map(group => (
                                <div key={group.title} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{group.title}</h3>
                                        <div className="h-px bg-gray-100 flex-1"></div>
                                        <span className="text-[10px] font-bold text-gray-300">{group.items.length} Clientes</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-4">
                                        {group.items.map(client => (
                                            <ClientCard
                                                key={client.rfc}
                                                client={client}
                                                onClick={() => onSelectClient(client.rfc, client.legal_name, client.last_sync_at || '', client.valid_until || '')}
                                                onEditGroup={() => { setSelectedClient(client); setIsGroupModalOpen(true); }}
                                                onEditTags={() => { setSelectedClient(client); setIsTagsModalOpen(true); }}
                                                onEditClient={() => {
                                                    setSelectedClient(client);
                                                    setAlias(client.common_name || client.legal_name);
                                                    setRfc(client.rfc);
                                                    setCiec(client.ciec || '');
                                                    setKeyPass(client.passphrase || '');
                                                    setIsEditMode(true);
                                                    setIsDrawerOpen(true);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </section>
                </div>
                </div>

                {/* Mobile Content */}
                <div className="md:hidden flex-1 overflow-y-auto pb-20 bg-[#F9FAFB]">
                    {/* HOME TAB */}
                    {mobileTab === 'home' && (
                        <div className="p-4 space-y-4">
                            {/* Riesgos Críticos */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setExpandRisks(!expandRisks)}
                                    className="w-full flex items-center justify-between p-4"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                                            <span className="material-symbols-outlined text-rose-500 text-xl">shield</span>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Riesgos Críticos</div>
                                            <div className="text-xl font-black text-gray-900">
                                                {String(fielRisks.expiredClients.length + fielRisks.expiringSoonClients.length).padStart(2, '0')}
                                            </div>
                                            <div className="text-xs text-gray-500">FIEL vencida / por vencer</div>
                                        </div>
                                    </div>
                                    <span className="material-symbols-outlined text-gray-400">
                                        {expandRisks ? 'expand_less' : 'expand_more'}
                                    </span>
                                </button>
                                {expandRisks && (fielRisks.expiredClients.length + fielRisks.expiringSoonClients.length) > 0 && (
                                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                                        {[
                                            ...fielRisks.expiredClients.map((c: any) => ({ ...c, _riskType: 'expired' as const })),
                                            ...fielRisks.expiringSoonClients.map((c: any) => ({ ...c, _riskType: 'soon' as const })),
                                        ].map((client: any) => (
                                            <div key={client.rfc} className="px-4 py-3 flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">{client.common_name || client.legal_name}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono">{client.rfc}</div>
                                                </div>
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${client._riskType === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                                    {client._riskType === 'expired' ? 'VENCIDA' : 'POR VENCER'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Últimas Solicitudes */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Últimas Solicitudes</span>
                                    <button onClick={onViewHistory} className="text-[10px] font-black text-emerald-600 uppercase">Ver todo</button>
                                </div>
                                <RecentRequests onViewHistory={onViewHistory} compact={true} />
                            </div>

                            {/* Problemas Operativos */}
                            {clients.filter((c: any) => c.sync_status === 'error').length > 0 && (
                                <div className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
                                    <div className="p-4 flex items-center gap-3 border-b border-orange-50">
                                        <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
                                            <span className="material-symbols-outlined text-orange-500 text-lg">warning</span>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Problemas Operativos</div>
                                            <div className="text-xs text-gray-600">{clients.filter((c: any) => c.sync_status === 'error').length} cliente(s) con error</div>
                                        </div>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {clients.filter((c: any) => c.sync_status === 'error').map((client: any) => (
                                            <div
                                                key={client.rfc}
                                                onClick={() => onSelectClient(client.rfc, client.legal_name, client.last_sync_at || '', client.valid_until || '')}
                                                className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
                                            >
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">{client.common_name || client.legal_name}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono">{client.rfc}</div>
                                                </div>
                                                <span className="material-symbols-outlined text-gray-300 text-lg">chevron_right</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CLIENTS TAB */}
                    {mobileTab === 'clients' && (
                        <div className="p-4 space-y-4">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                                <input
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#10B981]"
                                    placeholder="Buscar alias, RFC..."
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="space-y-4">
                                {groupedClients.map(group => (
                                    <div key={group.title}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{group.title}</span>
                                            <div className="h-px bg-gray-100 flex-1"></div>
                                            <span className="text-[10px] font-bold text-gray-300">{group.items.length}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {group.items.map((client: any) => (
                                                <div
                                                    key={client.rfc}
                                                    onClick={() => onSelectClient(client.rfc, client.legal_name, client.last_sync_at || '', client.valid_until || '')}
                                                    className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between cursor-pointer active:bg-gray-50"
                                                >
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">{client.common_name || client.legal_name}</div>
                                                        <div className="text-[10px] text-gray-400 font-mono">{client.rfc}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {client.sync_status === 'error' && (
                                                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                                        )}
                                                        {client.is_syncing && (
                                                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                                                        )}
                                                        <span className="material-symbols-outlined text-gray-300 text-lg">chevron_right</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SETTINGS TAB */}
                    {mobileTab === 'settings' && (
                        <div className="p-4 space-y-3">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Configuración</div>
                            <button
                                onClick={() => setIsManageGroupsOpen(true)}
                                className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-500 text-lg">folder</span>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-gray-900">Grupos</div>
                                        <div className="text-xs text-gray-400">{groups.length} grupos configurados</div>
                                    </div>
                                </div>
                                <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                            </button>
                            <button
                                onClick={() => setIsManageTagsOpen(true)}
                                className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-outlined text-blue-500 text-lg">label</span>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-gray-900">Etiquetas</div>
                                        <div className="text-xs text-gray-400">{tags.length} etiquetas configuradas</div>
                                    </div>
                                </div>
                                <span className="material-symbols-outlined text-gray-300">chevron_right</span>
                            </button>
                            <div className="pt-2">
                                <button
                                    onClick={logout}
                                    className="w-full bg-red-50 text-red-500 rounded-2xl px-4 py-4 flex items-center justify-center gap-2 font-bold text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">logout</span>
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Mobile FAB */}
                <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="md:hidden fixed bottom-20 right-5 z-40 w-14 h-14 bg-[#10B981] rounded-full shadow-lg flex items-center justify-center"
                >
                    <span className="material-symbols-outlined text-white text-3xl">add</span>
                </button>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 grid grid-cols-4 h-16">
                    {([
                        { tab: 'home' as const, icon: 'home', label: 'Inicio' },
                        { tab: 'clients' as const, icon: 'people', label: 'Clientes' },
                        { tab: 'history' as const, icon: 'history', label: 'Historial' },
                        { tab: 'settings' as const, icon: 'settings', label: 'Ajustes' },
                    ]).map(({ tab, icon, label }) => (
                        <button
                            key={tab}
                            onClick={() => tab === 'history' ? onViewHistory() : setMobileTab(tab)}
                            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${tab !== 'history' && mobileTab === tab ? 'text-[#10B981]' : 'text-gray-400'}`}
                        >
                            <span className="material-symbols-outlined text-xl">{icon}</span>
                            {label}
                        </button>
                    ))}
                </nav>
            </main>

            {/* MODAL: Change Group */}
            {isGroupModalOpen && selectedClient && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsGroupModalOpen(false)}></div>
                    <div className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Cambiar Grupo</h3>
                        <p className="text-xs text-gray-500 mb-6 font-medium">Asignar <span className="text-gray-900 font-bold">{selectedClient.legal_name}</span> a un grupo.</p>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                            <button
                                onClick={async () => {
                                    await updateClientGroup(selectedClient.id, null);
                                    setIsGroupModalOpen(false);
                                    loadClientsData();
                                    loadInitialData();
                                }}
                                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${!selectedClient.group_id ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
                            >
                                <span className="text-sm font-bold">Sin Grupo</span>
                                {!selectedClient.group_id && <span className="material-symbols-outlined text-emerald-500">check_circle</span>}
                            </button>
                            {groups.map(g => (
                                <button
                                    key={g.id}
                                    onClick={async () => {
                                        await updateClientGroup(selectedClient.id, g.id);
                                        setIsGroupModalOpen(false);
                                        loadClientsData();
                                        loadInitialData();
                                    }}
                                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedClient.group_id == g.id ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }}></div>
                                        <span className="text-sm font-bold">{g.name}</span>
                                    </div>
                                    {selectedClient.group_id == g.id && <span className="material-symbols-outlined text-emerald-500">check_circle</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Edit Tags */}
            {isTagsModalOpen && selectedClient && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsTagsModalOpen(false)}></div>
                    <div className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Editar Etiquetas</h3>
                        <p className="text-xs text-gray-500 mb-6 font-medium">Selecciona etiquetas para <span className="text-gray-900 font-bold">{selectedClient.legal_name}</span>.</p>

                        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar space-y-2">
                            {tags.map(t => {
                                const isSelected = selectedClient.tags?.some((ct: any) => ct.id === t.id);
                                return (
                                    <button
                                        key={t.id}
                                        onClick={async () => {
                                            const currentIds = selectedClient.tags?.map((ct: any) => ct.id) || [];
                                            const newIds = isSelected
                                                ? currentIds.filter((id: number) => id !== t.id)
                                                : [...currentIds, t.id];

                                            // Optimistic update
                                            const updatedClient = { ...selectedClient, tags: tags.filter(tag => newIds.includes(tag.id)) };
                                            setSelectedClient(updatedClient);

                                            await updateClientTags(selectedClient.id, newIds);
                                            loadClientsData();
                                        }}
                                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-100 hover:border-gray-200 text-gray-600'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }}></div>
                                            <span className="text-sm font-bold">{t.name}</span>
                                        </div>
                                        {isSelected && <span className="material-symbols-outlined text-blue-500">check_circle</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setIsTagsModalOpen(false)}
                            className="mt-6 w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL: Manage Groups */}
            {isManageGroupsOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsManageGroupsOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden p-8 flex flex-col max-h-[80vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Configurar Grupos</h3>
                            <button onClick={() => setIsManageGroupsOpen(false)} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                                <span className="material-symbols-outlined text-gray-400">close</span>
                            </button>
                        </div>

                        {/* Add/Edit form */}
                        <div className="bg-gray-50 p-4 rounded-2xl mb-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Nombre del Grupo</label>
                                <input
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    placeholder="Ej. Clientes VIP"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Color:</label>
                                    <input type="color" value={newGroupColor} onChange={e => setNewGroupColor(e.target.value)} className="w-8 h-8 rounded-lg overflow-hidden border-none p-0 cursor-pointer" />
                                </div>
                                <button
                                    onClick={handleSaveGroup}
                                    className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors"
                                >
                                    {editingEntity ? 'Actualizar' : 'Crear Grupo'}
                                </button>
                            </div>
                            {editingEntity && (
                                <button onClick={() => { setEditingEntity(null); setNewGroupName(''); }} className="text-[10px] text-gray-400 hover:underline">Cancelar edición</button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                            {groups.map(g => (
                                <div key={g.id} className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 hover:border-gray-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: g.color }}></div>
                                        <span className="text-sm font-bold text-gray-700">{g.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => { setEditingEntity(g); setNewGroupName(g.name); setNewGroupColor(g.color); }}
                                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteGroup(g.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Manage Tags */}
            {isManageTagsOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsManageTagsOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden p-8 flex flex-col max-h-[80vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Configurar Etiquetas</h3>
                            <button onClick={() => setIsManageTagsOpen(false)} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                                <span className="material-symbols-outlined text-gray-400">close</span>
                            </button>
                        </div>

                        {/* Add/Edit form */}
                        <div className="bg-gray-50 p-4 rounded-2xl mb-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Nombre de Etiqueta</label>
                                <input
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold"
                                    value={newTagName}
                                    onChange={e => setNewTagName(e.target.value)}
                                    placeholder="Ej. RESICO"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Color:</label>
                                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="w-8 h-8 rounded-lg overflow-hidden border-none p-0 cursor-pointer" />
                                </div>
                                <button
                                    onClick={handleSaveTag}
                                    className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-colors"
                                >
                                    {editingEntity ? 'Actualizar' : 'Crear Etiqueta'}
                                </button>
                            </div>
                            {editingEntity && (
                                <button onClick={() => { setEditingEntity(null); setNewTagName(''); }} className="text-[10px] text-gray-400 hover:underline">Cancelar edición</button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                            {tags.map(t => (
                                <div key={t.id} className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 hover:border-gray-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: t.color }}></div>
                                        <span className="text-sm font-bold text-gray-700">{t.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => { setEditingEntity(t); setNewTagName(t.name); setNewTagColor(t.color); }}
                                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTag(t.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* DRAWER: Add/Edit Client */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-end">
                    <div
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                        onClick={() => { setIsDrawerOpen(false); resetForm(); }}
                    ></div>
                    <div className="relative w-full max-w-md bg-white h-screen shadow-2xl flex flex-col z-[110] transform transition-transform duration-300 translate-x-0 overflow-hidden">
                        {/* Header */}
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}</h2>
                                <p className="text-xs text-gray-500 font-medium">
                                    {isEditMode ? 'Actualiza la información y credenciales' : 'Configura las credenciales del SAT para iniciar'}
                                </p>
                            </div>
                            <button
                                onClick={() => { setIsDrawerOpen(false); resetForm(); }}
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Form */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                            {errorMessage && (
                                <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-[11px] font-bold rounded-2xl flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    {errorMessage}
                                </div>
                            )}

                            {/* Section 1: Basic Info */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
                                        <span className="material-symbols-outlined text-xl">{isEditMode ? 'edit' : 'person_add'}</span>
                                    </div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Información Básica</h3>
                                </div>
                                <div className="grid gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre / Alias</label>
                                        <input
                                            className="w-full px-5 py-3 rounded-2xl border border-gray-200 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] transition-all"
                                            placeholder="Ej. Mi Empresa S.A."
                                            type="text"
                                            value={alias}
                                            onChange={(e) => setAlias(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">RFC</label>
                                        <input
                                            disabled={isEditMode}
                                            className={`w-full px-5 py-3 rounded-2xl border border-gray-200 font-mono text-sm uppercase font-semibold focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] transition-all ${isEditMode ? 'bg-gray-50 text-gray-400' : ''}`}
                                            placeholder="RFC123456ABC"
                                            type="text"
                                            value={rfc}
                                            onChange={(e) => setRfc(e.target.value.toUpperCase())}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Section 2: FIEL (Hide files if edit mode if you don't want to re-upload) */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                                        <span className="material-symbols-outlined text-xl">verified_user</span>
                                    </div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Credenciales FIEL {isEditMode && '(Opcional actualizar)'}</h3>
                                </div>
                                {!isEditMode && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-6 transition-all cursor-pointer ${cerFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-500 hover:bg-emerald-50/30'}`}>
                                            <span className={`material-symbols-outlined mb-3 text-4xl ${cerFile ? 'text-emerald-500' : 'text-gray-300 group-hover:text-emerald-500'}`}>upload_file</span>
                                            <p className="text-[10px] font-bold text-gray-500 text-center truncate max-w-full px-2">
                                                {cerFile ? cerFile.name : 'Archivo .cer'}
                                            </p>
                                            <input
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                type="file"
                                                accept=".cer"
                                                onChange={handleCerChange}
                                            />
                                        </div>
                                        <div className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-6 transition-all cursor-pointer ${keyFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-500 hover:bg-emerald-50/30'}`}>
                                            <span className={`material-symbols-outlined mb-3 text-4xl ${keyFile ? 'text-emerald-500' : 'text-gray-300 group-hover:text-emerald-500'}`}>key</span>
                                            <p className="text-[10px] font-bold text-gray-500 text-center truncate max-w-full px-2">
                                                {keyFile ? keyFile.name : 'Archivo .key'}
                                            </p>
                                            <input
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                type="file"
                                                accept=".key"
                                                onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contraseña de Clave Privada</label>
                                    <div className="relative">
                                        <input
                                            className="w-full px-5 py-3 rounded-2xl border border-gray-200 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] transition-all pr-12"
                                            placeholder="••••••••"
                                            type={showKeyPass ? "text" : "password"}
                                            value={keyPass}
                                            onChange={(e) => setKeyPass(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKeyPass(!showKeyPass)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-xl">
                                                {showKeyPass ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* Section 3: Actualizar FIEL (solo edit mode) */}
                            {isEditMode && (
                                <section className="space-y-6 border-t border-gray-100 pt-8">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg ${selectedClient?.valid_until && new Date(selectedClient.valid_until) < new Date() ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                                <span className="material-symbols-outlined text-xl">refresh</span>
                                            </div>
                                            <div>
                                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Renovar FIEL</h3>
                                                {selectedClient?.valid_until && (
                                                    <p className={`text-[10px] font-bold mt-0.5 ${new Date(selectedClient.valid_until) < new Date() ? 'text-red-500' : 'text-amber-500'}`}>
                                                        {new Date(selectedClient.valid_until) < new Date()
                                                            ? `⚠ Vencida el ${new Date(selectedClient.valid_until).toLocaleDateString('es-MX')}`
                                                            : `Válida hasta ${new Date(selectedClient.valid_until).toLocaleDateString('es-MX')}`
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Feedback message */}
                                    {fielMessage && (
                                        <div className={`p-3 rounded-2xl text-[11px] font-bold flex items-center gap-2 ${fielMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                            <span className="material-symbols-outlined text-base">{fielMessage.type === 'success' ? 'check_circle' : 'error'}</span>
                                            {fielMessage.text}
                                        </div>
                                    )}

                                    <form onSubmit={handleFielUpdate} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-5 transition-all cursor-pointer ${fielCerFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-500 hover:bg-emerald-50/30'}`}>
                                                <span className={`material-symbols-outlined mb-2 text-3xl ${fielCerFile ? 'text-emerald-500' : 'text-gray-300 group-hover:text-emerald-500'}`}>upload_file</span>
                                                <p className="text-[10px] font-bold text-gray-500 text-center truncate max-w-full px-1">
                                                    {fielCerFile ? fielCerFile.name : 'Nuevo .cer'}
                                                </p>
                                                <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" accept=".cer" onChange={e => setFielCerFile(e.target.files?.[0] || null)} />
                                            </div>
                                            <div className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-5 transition-all cursor-pointer ${fielKeyFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-500 hover:bg-emerald-50/30'}`}>
                                                <span className={`material-symbols-outlined mb-2 text-3xl ${fielKeyFile ? 'text-emerald-500' : 'text-gray-300 group-hover:text-emerald-500'}`}>key</span>
                                                <p className="text-[10px] font-bold text-gray-500 text-center truncate max-w-full px-1">
                                                    {fielKeyFile ? fielKeyFile.name : 'Nuevo .key'}
                                                </p>
                                                <input className="absolute inset-0 opacity-0 cursor-pointer" type="file" accept=".key" onChange={e => setFielKeyFile(e.target.files?.[0] || null)} />
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                className="w-full px-5 py-3 rounded-2xl border border-gray-200 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] transition-all pr-12"
                                                placeholder="Contraseña de la nueva FIEL"
                                                type={showFielPass ? 'text' : 'password'}
                                                value={fielPass}
                                                onChange={e => setFielPass(e.target.value)}
                                            />
                                            <button type="button" onClick={() => setShowFielPass(!showFielPass)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                                                <span className="material-symbols-outlined text-xl">{showFielPass ? 'visibility_off' : 'visibility'}</span>
                                            </button>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={fielSubmitting || !fielCerFile || !fielKeyFile || !fielPass}
                                            className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className={`material-symbols-outlined text-base ${fielSubmitting ? 'animate-spin' : ''}`}>{fielSubmitting ? 'sync' : 'verified_user'}</span>
                                            {fielSubmitting ? 'Actualizando...' : 'Actualizar FIEL'}
                                        </button>
                                    </form>
                                </section>
                            )}

                            {/* Section 4: CIEC */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-orange-50 rounded-lg text-orange-600">
                                        <span className="material-symbols-outlined text-xl">lock</span>
                                    </div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Contraseña SAT (CIEC)</h3>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contraseña CIEC (Opcional)</label>
                                    <div className="relative">
                                        <input
                                            className="w-full px-5 py-3 rounded-2xl border border-gray-200 text-sm font-semibold focus:ring-4 focus:ring-emerald-500/5 focus:border-[#10B981] transition-all pr-12"
                                            placeholder="••••••••"
                                            type={showCiec ? "text" : "password"}
                                            value={ciec}
                                            onChange={(e) => setCiec(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCiec(!showCiec)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-xl">
                                                {showCiec ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {isEditMode && (
                                <section className="pt-8 border-t border-gray-100">
                                    <button
                                        onClick={handleDeleteClient}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-4 border-2 border-red-50 text-red-500 text-xs font-bold rounded-2xl hover:bg-red-50 hover:border-red-100 transition-all uppercase tracking-widest"
                                    >
                                        <span className="material-symbols-outlined text-lg">delete_forever</span>
                                        Eliminar Cliente Permanente
                                    </button>
                                </section>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-8 bg-gray-50 border-t border-gray-100">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full py-5 bg-[#10B981] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-[#059669] transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className={`material-symbols-outlined text-xl ${submitting ? 'animate-spin' : ''}`}>
                                    {submitting ? 'sync' : (isEditMode ? 'save' : 'auto_mode')}
                                </span>
                                {submitting ? 'Procesando...' : (isEditMode ? 'Guardar Cambios' : 'Registrar e iniciar sincronización')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
