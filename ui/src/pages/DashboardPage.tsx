
import React, { useState, useEffect, useMemo } from 'react';
import { parseCertificate, createClient } from '../services';
import { listGroups, createGroup, updateGroup, deleteGroup } from '../api/groups';
import { listTags, createTag, updateTag, deleteTag } from '../api/tags';
import { listClients, updateClientGroup, updateClientTags, updateClientInfo, deleteClient } from '../api/clients';
import { GroupCardsRow } from '../components/GroupCardsRow';
import { TagsFilter } from '../components/TagsFilter';
import { GroupByToggle } from '../components/GroupByToggle';
import type { GroupByMode } from '../components/GroupByToggle';
import { ClientCard } from '../components/ClientCard';
import { RecentRequests } from '../components/RecentRequests';

export const DashboardPage = ({
    onSelectClient,
    onViewHistory
}: {
    onSelectClient: (rfc: string, name: string) => void,
    onViewHistory: () => void
}) => {
    // Data states
    const [clients, setClients] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // UI states
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
    const [isManageGroupsOpen, setIsManageGroupsOpen] = useState(false);
    const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [isEditMode, setIsEditMode] = useState(false);

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

    // Group/Tag form state
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupColor, setNewGroupColor] = useState('#10B981');
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3B82F6');
    const [editingEntity, setEditingEntity] = useState<any>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

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
            const [gRes, tRes] = await Promise.all([listGroups(), listTags()]);
            setGroups(gRes);
            setTags(tRes);
        } catch (err) {
            console.error("Error loading metadata", err);
        }
    };

    const loadClientsData = async () => {
        try {
            setLoading(true);
            const res = await listClients({
                q: search,
                group_id: selectedGroupId === 'all' ? undefined : (selectedGroupId === 'null' ? 'null' : selectedGroupId),
                tag_ids: selectedTagIds,
                pageSize: 100 // Load more for grouping
            });
            setClients(res.data || []);
        } catch (err) {
            console.error("Error loading clients", err);
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

    return (
        <div className="flex h-screen bg-[#F9FAFB] font-['Inter'] overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-20 lg:w-24 flex-shrink-0 flex flex-col items-center py-8 bg-white border-r border-gray-100 z-20">
                <div className="mb-10 p-3 bg-[#10B981] rounded-2xl shadow-lg shadow-emerald-200 cursor-pointer">
                    <span className="material-symbols-outlined text-white text-3xl">account_balance_wallet</span>
                </div>
                <nav className="flex flex-col gap-8 w-full items-center">
                    <button className="p-3 rounded-2xl bg-emerald-50 text-[#10B981] transition-all">
                        <span className="material-symbols-outlined">dashboard</span>
                    </button>
                    <button className="p-3 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all">
                        <span className="material-symbols-outlined">group</span>
                    </button>
                    <button className="p-3 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all opacity-40">
                        <span className="material-symbols-outlined">task</span>
                    </button>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white border-b border-gray-100 z-10 sticky top-0">
                    <div className="h-20 flex items-center justify-between px-10">
                        <div className="flex items-center gap-6">
                            <h1 className="text-xl font-bold tracking-tight text-gray-900">Dashboard de Clientes</h1>
                            <div className="h-6 w-px bg-gray-200"></div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                SAT Sync: hace 2h
                            </div>
                        </div>
                        <div className="flex-1 max-w-xl mx-8 relative">
                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none material-symbols-outlined text-gray-400 text-xl">search</span>
                            <input
                                className="block w-full pl-12 pr-4 py-2.5 border border-gray-200 rounded-2xl bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-[#10B981] transition-all"
                                placeholder="Buscar por Alias o RFC..."
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsDrawerOpen(true)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-[#10B981] text-white text-sm font-bold rounded-2xl hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100 whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            Nuevo Cliente
                        </button>
                    </div>

                    <div className="px-10 py-4 border-t border-gray-50 flex items-center gap-8 text-sm">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grupo</span>
                            <div className="flex items-center gap-1">
                                <select
                                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all min-w-[160px] appearance-none cursor-pointer"
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
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agrupar por:</span>
                            <GroupByToggle mode={groupByMode} onChange={setGroupByMode} />
                        </div>

                        <div className="flex items-center gap-3 flex-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Etiquetas</span>
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

                <div className="flex-1 overflow-y-auto px-10 py-8 space-y-12">
                    {/* Groups Overview Row */}
                    <section>
                        <GroupCardsRow
                            groups={groups}
                            selectedGroupId={selectedGroupId}
                            onSelectGroup={setSelectedGroupId}
                        />
                    </section>

                    {/* Risk Radar (Mockup) */}
                    <section className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-red-50 rounded-xl">
                                    <span className="material-symbols-outlined text-[#EF4444] text-2xl">shield</span>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Radar de Riesgos Fiscales</h2>
                                <span className="px-3 py-1 bg-red-50 text-[#EF4444] text-[10px] font-bold uppercase tracking-widest rounded-full">3 Críticos</span>
                            </div>
                            <button className="text-[#10B981] text-xs font-bold hover:underline flex items-center gap-1 uppercase tracking-wider">
                                Ver todos los errores
                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </button>
                        </div>
                        <div className="flex gap-8 opacity-40 grayscale pointer-events-none select-none">
                            <div className="flex-1 p-6 rounded-3xl border border-gray-50 bg-gray-50/50">
                                <h3 className="font-bold text-gray-400 mb-2">Proveedores 69-B</h3>
                                <div className="h-2 w-full bg-gray-200 rounded-full"></div>
                            </div>
                            <div className="flex-1 p-6 rounded-3xl border border-gray-50 bg-gray-50/50">
                                <h3 className="font-bold text-gray-400 mb-2">Diferencias IVA</h3>
                                <div className="h-2 w-full bg-gray-200 rounded-full"></div>
                            </div>
                            <div className="flex-1 p-6 rounded-3xl border border-gray-50 bg-gray-50/50">
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
                                                onClick={() => onSelectClient(client.rfc, client.legal_name)}
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

                            {/* Section 3: CIEC */}
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
