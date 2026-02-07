
import React from 'react';

export type GroupByMode = 'group' | 'regimen' | 'sector' | 'none';

interface GroupByToggleProps {
    mode: GroupByMode;
    onChange: (mode: GroupByMode) => void;
}

export const GroupByToggle = ({ mode, onChange }: GroupByToggleProps) => {
    const options: { label: string, value: GroupByMode }[] = [
        { label: 'Grupo', value: 'group' },
        { label: 'Régimen', value: 'regimen' },
        { label: 'Sector', value: 'sector' },
        { label: 'Sin agrupar', value: 'none' }
    ];

    return (
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
            {options.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${mode === opt.value ? 'bg-white text-[#10B981] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};
