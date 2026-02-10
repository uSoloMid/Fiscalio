


interface GroupCardProps {
    name: string;
    count: number;
    pending?: number;
    icon: string;
    color: string;
    isActive: boolean;
    onClick: () => void;
}

export const GroupCard = ({ name, count, pending, icon, color, isActive, onClick }: GroupCardProps) => {
    return (
        <div
            onClick={onClick}
            className={`flex-1 min-w-[200px] p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${isActive ? 'bg-white border-[#10B981] shadow-lg shadow-emerald-50' : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'}`}
        >
            <div className={`p-3 rounded-2xl flex items-center justify-center`} style={{ backgroundColor: color + '10', color: color }}>
                <span className="material-symbols-outlined text-2xl">{icon}</span>
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">{name}</h4>
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900">{count} Clientes</span>
                    {pending !== undefined && pending > 0 && (
                        <span className="text-[10px] font-medium text-red-500">· {pending} Pendientes</span>
                    )}
                </div>
            </div>
        </div>
    );
};

export const GroupCardsRow = ({ groups, selectedGroupId, onSelectGroup }: { groups: any[], selectedGroupId: string | number | null, onSelectGroup: (id: any) => void }) => {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            <GroupCard
                name="Todos"
                count={groups.reduce((acc, g) => acc + g.businesses_count, 0)}
                icon="grid_view"
                color="#10B981"
                isActive={selectedGroupId === 'all'}
                onClick={() => onSelectGroup('all')}
            />
            {groups.map(group => (
                <GroupCard
                    key={group.id}
                    name={group.name}
                    count={group.businesses_count}
                    icon={group.name.includes('Corporativos') ? 'corporate_fare' : (group.name.includes('Físicas') ? 'person' : 'business')}
                    color={group.color || '#6366f1'}
                    isActive={selectedGroupId == group.id}
                    onClick={() => onSelectGroup(group.id)}
                />
            ))}
            <GroupCard
                name="Sin Grupo"
                count={0} // This should ideally come from backend too
                icon="group_off"
                color="#9ca3af"
                isActive={selectedGroupId === 'null'}
                onClick={() => onSelectGroup('null')}
            />
        </div>
    );
};
