
import React, { useState } from 'react';

interface Tag {
    id: number;
    name: string;
    color: string;
}

interface TagsFilterProps {
    availableTags: Tag[];
    selectedTagIds: number[];
    onChange: (tagIds: number[]) => void;
}

export const TagsFilter = ({ availableTags, selectedTagIds, onChange }: TagsFilterProps) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleTag = (tagId: number) => {
        if (selectedTagIds.includes(tagId)) {
            onChange(selectedTagIds.filter(id => id !== tagId));
        } else {
            onChange([...selectedTagIds, tagId]);
        }
    };

    const selectedTags = availableTags.filter(t => selectedTagIds.includes(t.id));

    return (
        <div className="relative">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl min-w-[200px] cursor-pointer hover:border-gray-300 transition-all"
            >
                <span className="material-symbols-outlined text-gray-400 text-xl">sell</span>
                <div className="flex-1 flex gap-1 overflow-hidden">
                    {selectedTags.length > 0 ? (
                        selectedTags.map(tag => (
                            <span
                                key={tag.id}
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap"
                                style={{ backgroundColor: tag.color || '#10B981' }}
                            >
                                {tag.name}
                            </span>
                        ))
                    ) : (
                        <span className="text-sm text-gray-400">Filtrar por etiquetas...</span>
                    )}
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </div>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-40 p-4 max-h-60 overflow-y-auto">
                        <div className="grid grid-cols-1 gap-2">
                            {availableTags.map(tag => (
                                <div
                                    key={tag.id}
                                    onClick={() => toggleTag(tag.id)}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors ${selectedTagIds.includes(tag.id) ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-gray-50 text-gray-600'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || '#10B981' }}></div>
                                        <span className="text-sm font-medium">{tag.name}</span>
                                    </div>
                                    {selectedTagIds.includes(tag.id) && (
                                        <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
