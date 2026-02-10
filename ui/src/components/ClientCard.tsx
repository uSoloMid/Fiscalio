
import React, { useState } from 'react';

interface ClientCardProps {
    client: any;
    onClick: () => void;
    onEditGroup: () => void;
    onEditTags: () => void;
    onEditClient: () => void;
}

export const ClientCard = ({ client, onClick, onEditGroup, onEditTags, onEditClient }: ClientCardProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

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
                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{client.rfc}</p>
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

            <div className="pt-2.5 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Sincronizado</span>
                </div>
                <span className="text-[9px] text-gray-400 font-medium">hace 12m</span>
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
