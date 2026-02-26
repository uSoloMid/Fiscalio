import React, { useState, useEffect } from 'react';

interface ClientCardProps {
    client: any;
    onClick: () => void;
    onEditGroup: () => void;
    onEditTags: () => void;
    onEditClient: () => void;
}

function getTimeStatus(client: any, _nowTick: number): { text: string, type: 'syncing' | 'pending' | 'ok' | 'error', nextText: string } {
    if (client.is_syncing || client.sync_status === 'checking' || client.sync_status === 'queued') {
        return { text: 'Sincronizando...', type: 'syncing', nextText: 'En progreso' };
    }
    if (client.sync_status === 'error') {
        return { text: 'Fallo al sincronizar', type: 'error', nextText: 'Reintentará pronto' };
    }
    if (!client.last_sync_at) {
        return { text: 'Pendiente', type: 'pending', nextText: 'Sin sincronizar aún' };
    }

    // Check when was last sync and next sync
    const lastSyncDate = new Date(client.last_sync_at.replace(" ", "T"));
    const now = new Date(_nowTick);

    // Elapsed time
    const diffMs = now.getTime() - lastSyncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let text = '';
    if (diffDays > 0) text = `hace ${diffDays}d`;
    else if (diffHours > 0) text = `hace ${diffHours}h ${diffMins % 60}m`;
    else text = `hace ${diffMins}m`;

    // Next sync (threshold is 6 hours)
    const nextSyncMs = lastSyncDate.getTime() + (6 * 60 * 60 * 1000);
    const timeLeftMs = nextSyncMs - now.getTime();

    let nextText = '';
    if (timeLeftMs <= 0) {
        nextText = 'Sincronización inminente';
    } else {
        const leftMins = Math.floor(timeLeftMs / 60000);
        const leftHours = Math.floor(leftMins / 60);
        if (leftHours > 0) nextText = `Próx. act. en ${leftHours}h ${leftMins % 60}m`;
        else nextText = `Próx. act. en ${leftMins}m`;
    }

    return { text, type: 'ok', nextText };
}

export const ClientCard = ({ client, onClick, onEditGroup, onEditTags, onEditClient }: ClientCardProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [nowTick, setNowTick] = useState(Date.now());

    // Update time every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setNowTick(Date.now());
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

    const statusObj = getTimeStatus(client, nowTick);

    const fielStatus = React.useMemo(() => {
        if (!client.valid_until) return null;
        const validMs = new Date(client.valid_until.replace(" ", "T")).getTime();
        const diffDays = Math.ceil((validMs - nowTick) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            return {
                text: `FIEL vencida (${Math.abs(diffDays)}d)`,
                icon: 'warning',
                className: 'text-red-700 bg-red-50 border-red-200'
            };
        } else if (diffDays <= 30) {
            return {
                text: `FIEL vence en ${diffDays}d`,
                icon: 'schedule',
                className: 'text-orange-700 bg-orange-50 border-orange-200'
            };
        } else {
            return {
                text: `FIEL vigente`,
                icon: 'verified',
                className: 'text-gray-500 bg-gray-50 border-gray-200'
            };
        }
    }, [client.valid_until, nowTick]);

    return (
        <div
            onClick={onClick}
            className="group relative bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:border-[#10B981] hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-1 h-full flex flex-col justify-between"
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate group-hover:text-[#10B981] transition-colors pr-6">
                        {client.common_name || client.legal_name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{client.rfc}</p>
                        {fielStatus && (
                            <div className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${fielStatus.className}`}>
                                <span className="material-symbols-outlined text-[10px]">{fielStatus.icon}</span>
                                {fielStatus.text}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleMenuClick}
                    className="p-1 px-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors absolute top-3 right-3"
                >
                    <span className="material-symbols-outlined text-lg">more_vert</span>
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[22px]">
                {client.group && (
                    <span
                        className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border"
                        style={{ backgroundColor: client.group.color + '10', color: client.group.color, borderColor: client.group.color + '30' }}
                    >
                        {client.group.name}
                    </span>
                )}
                {client.tags?.map((tag: any) => (
                    <span
                        key={tag.id}
                        className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-100"
                    >
                        {tag.name}
                    </span>
                ))}
                {(!client.group && (!client.tags || client.tags.length === 0)) && (
                    <span className="text-[9px] text-gray-300 italic">Sin etiquetas</span>
                )}
            </div>

            <div className="pt-2.5 border-t border-gray-50 flex flex-col gap-1.5 mt-auto">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className={`flex-shrink-0 h-1.5 w-1.5 rounded-full ${statusObj.type === 'ok' ? 'bg-emerald-500' : statusObj.type === 'syncing' ? 'bg-blue-500 animate-pulse' : statusObj.type === 'error' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                        <span className={`text-[9px] font-bold uppercase truncate ${statusObj.type === 'ok' ? 'text-emerald-600' : statusObj.type === 'syncing' ? 'text-blue-600' : statusObj.type === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                            {statusObj.type === 'ok' ? 'Sincronizado' : statusObj.type === 'syncing' ? 'Sincronizando' : statusObj.text}
                        </span>
                    </div>
                    {statusObj.type === 'ok' && (
                        <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap pl-2 flex-shrink-0">{statusObj.text}</span>
                    )}
                </div>
                {statusObj.nextText && (
                    <div className="text-[9px] text-gray-400 font-medium text-right italic">
                        {statusObj.nextText}
                    </div>
                )}
            </div>

            {/* Floating Menu */}
            {isMenuOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="absolute top-10 right-3 w-44 bg-white border border-gray-100 rounded-xl shadow-2xl z-20 overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditGroup(); setIsMenuOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base">folder_shared</span>
                            Cambiar grupo
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditTags(); setIsMenuOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base">label</span>
                            Editar etiquetas
                        </button>
                        <div className="h-px bg-gray-50 my-1 mx-2"></div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditClient(); setIsMenuOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base">settings</span>
                            Configurar
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
