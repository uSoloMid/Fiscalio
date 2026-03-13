import { useState, useEffect } from 'react';
import { listUsers, createUser, deleteUser, syncUserBusinesses } from '../services';
import { listClients } from '../api/clients';

interface UserRow {
    id: number;
    name: string;
    email: string;
    is_admin: boolean;
    businesses: { id: number; rfc: string; common_name: string; legal_name: string }[];
}

interface Props {
    onBack: () => void;
}

export function UsersPage({ onBack }: Props) {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [allBusinesses, setAllBusinesses] = useState<{ id: number; rfc: string; common_name: string; legal_name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal crear usuario
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Modal asignar clientes
    const [assignUser, setAssignUser] = useState<UserRow | null>(null);
    const [selectedBusinessIds, setSelectedBusinessIds] = useState<number[]>([]);
    const [savingAssign, setSavingAssign] = useState(false);

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        setError('');
        try {
            const [usersData, businessesData] = await Promise.all([
                listUsers(),
                listClients({ pageSize: 500 }),
            ]);
            setUsers(usersData);
            setAllBusinesses(businessesData.data ?? businessesData);
        } catch (e: any) {
            setError(e.message || 'Error cargando datos');
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            await createUser(form);
            setShowCreate(false);
            setForm({ name: '', email: '', password: '' });
            loadAll();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(user: UserRow) {
        if (!confirm(`¿Eliminar al usuario ${user.name}? Esta acción no se puede deshacer.`)) return;
        try {
            await deleteUser(user.id);
            loadAll();
        } catch (err: any) {
            alert(err.message || 'Error al eliminar');
        }
    }

    function openAssign(user: UserRow) {
        setAssignUser(user);
        setSelectedBusinessIds(user.businesses.map(b => b.id));
    }

    async function handleSyncBusinesses() {
        if (!assignUser) return;
        setSavingAssign(true);
        try {
            await syncUserBusinesses(assignUser.id, selectedBusinessIds);
            setAssignUser(null);
            loadAll();
        } catch (err: any) {
            alert(err.message || 'Error al guardar');
        } finally {
            setSavingAssign(false);
        }
    }

    function toggleBusiness(id: number) {
        setSelectedBusinessIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Volver
                    </button>
                    <div className="h-5 w-px bg-gray-200" />
                    <h1 className="text-lg font-bold text-gray-900">Gestión de Usuarios</h1>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="bg-[#0C6B4B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0a573b] flex items-center gap-1.5"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo contador
                </button>
            </div>

            <div className="max-w-4xl mx-auto p-6">
                {loading ? (
                    <div className="text-center py-16 text-gray-400">Cargando...</div>
                ) : error ? (
                    <div className="text-center py-16 text-red-500">{error}</div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-5 py-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Nombre</th>
                                    <th className="text-left px-5 py-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Correo</th>
                                    <th className="text-left px-5 py-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Rol</th>
                                    <th className="text-left px-5 py-3 font-semibold text-gray-500 uppercase text-xs tracking-wider">Clientes</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-12 text-gray-400">
                                            No hay usuarios todavía. Crea el primer contador.
                                        </td>
                                    </tr>
                                ) : users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3.5 font-medium text-gray-900">{user.name}</td>
                                        <td className="px-5 py-3.5 text-gray-500">{user.email}</td>
                                        <td className="px-5 py-3.5">
                                            {user.is_admin ? (
                                                <span className="inline-flex items-center gap-1 bg-[#0C6B4B]/10 text-[#0C6B4B] text-xs font-semibold px-2.5 py-1 rounded-full">
                                                    Admin
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                                    Contador
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-500">
                                            {user.is_admin ? (
                                                <span className="text-gray-400 italic text-xs">Todos</span>
                                            ) : (
                                                <span>
                                                    {user.businesses.length === 0
                                                        ? <span className="text-amber-600 text-xs">Sin asignar</span>
                                                        : `${user.businesses.length} cliente${user.businesses.length !== 1 ? 's' : ''}`
                                                    }
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            {!user.is_admin && (
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        onClick={() => openAssign(user)}
                                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                                    >
                                                        Asignar clientes
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal crear usuario */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
                        <h2 className="text-lg font-bold text-gray-900 mb-1">Nuevo Contador</h2>
                        <p className="text-sm text-gray-500 mb-5">El contador solo verá los clientes que le asignes.</p>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                                <input
                                    type="text" required value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="María González"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                                <input
                                    type="email" required value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="maria@fiscalio.cloud"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal</label>
                                <input
                                    type="password" required minLength={6} value={form.password}
                                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="Mínimo 6 caracteres"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0C6B4B] focus:border-[#0C6B4B] outline-none"
                                />
                            </div>
                            {formError && (
                                <div className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{formError}</div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowCreate(false); setFormError(''); }}
                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit" disabled={saving}
                                    className="px-5 py-2 text-sm bg-[#0C6B4B] text-white rounded-lg hover:bg-[#0a573b] disabled:opacity-50 font-medium"
                                >
                                    {saving ? 'Creando...' : 'Crear contador'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal asignar clientes */}
            {assignUser && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Clientes de {assignUser.name}</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Selecciona los RFCs que este contador puede ver.
                                {selectedBusinessIds.length > 0 && (
                                    <span className="ml-2 text-[#0C6B4B] font-medium">{selectedBusinessIds.length} seleccionados</span>
                                )}
                            </p>
                        </div>

                        {/* Seleccionar / deseleccionar todos */}
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setSelectedBusinessIds(allBusinesses.map(b => b.id))}
                                className="text-xs text-blue-600 hover:underline"
                            >
                                Todos
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                                onClick={() => setSelectedBusinessIds([])}
                                className="text-xs text-gray-500 hover:underline"
                            >
                                Ninguno
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 border border-gray-200 rounded-xl divide-y">
                            {allBusinesses.map(b => (
                                <label key={b.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedBusinessIds.includes(b.id)}
                                        onChange={() => toggleBusiness(b.id)}
                                        className="w-4 h-4 accent-[#0C6B4B] rounded"
                                    />
                                    <div className="min-w-0">
                                        <span className="text-sm font-medium text-gray-800">{b.rfc}</span>
                                        <span className="text-xs text-gray-500 ml-2 truncate">{b.common_name || b.legal_name}</span>
                                    </div>
                                </label>
                            ))}
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setAssignUser(null)}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSyncBusinesses}
                                disabled={savingAssign}
                                className="px-5 py-2 text-sm bg-[#0C6B4B] text-white rounded-lg hover:bg-[#0a573b] disabled:opacity-50 font-medium"
                            >
                                {savingAssign ? 'Guardando...' : 'Guardar asignación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
