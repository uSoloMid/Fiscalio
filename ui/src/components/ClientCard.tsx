
import React, { useState } from 'react';

interface ClientCardProps {
    client: any;
    onClick: () => void;
    onEditGroup: () => void;
    onEditTags: () => void;
}

export const ClientCard = ({ client, onClick, onEditGroup, onEditTags }: ClientCardProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

    return (
        <div
            onClick={onClick}
            className="group relative bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:border-[#10B981] hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-1"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-gray-900 truncate group-hover:text-[#10B981] transition-colors pr-8">
                        {client.legal_name}
                    </h4>
                    <p className="text-[11px] text-gray-400 font-mono uppercase tracking-wider mt-0.5">{client.rfc}</p>
                </div>
                <button
                    onClick={handleMenuClick}
                    className="p-1 px-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors absolute top-6 right-6"
                >
                    <span className="material-symbols-outlined text-xl">more_vert</span>
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 min-h-[24px]">
                {client.group && (
                    <span
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
                        style={{ backgroundColor: client.group.color + '10', color: client.group.color, borderColor: client.group.color + '30' }}
                    >
                        {client.group.name}
                    </span>
                )}
                {client.tags?.map((tag: any) => (
                    <span
                        key={tag.id}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-100"
                    >
                        {tag.name}
                    </span>
                ))}
                {(!client.group && (!client.tags || client.tags.length === 0)) && (
                    <span className="text-[10px] text-gray-300 italic">Sin etiquetas</span>
                )}
            </div>

            <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-emerald-600">SYNC OK</span>
                </div>
                <span className="text-[10px] text-gray-400 font-medium">hace 12m</span>
            </div>

            {/* Floating Menu */}
            {isMenuOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="absolute top-14 right-6 w-48 bg-white border border-gray-100 rounded-2xl shadow-2xl z-20 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditGroup(); setIsMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">folder_shared</span>
                            Cambiar grupo
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditTags(); setIsMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">label</span>
                            Editar etiquetas
                        </button>
                        <div className="h-px bg-gray-50 my-1 mx-2"></div>
                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors opacity-50 cursor-not-allowed">
                            <span className="material-symbols-outlined text-lg">settings</span>
                            Configurar
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
