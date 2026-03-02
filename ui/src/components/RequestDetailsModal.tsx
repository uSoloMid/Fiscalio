import type { SatRequest } from '../models';

interface Props {
    request: SatRequest;
    isOpen: boolean;
    onClose: () => void;
}

export function RequestDetailsModal({ request, isOpen, onClose }: Props) {
    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    };

    const isSystemError = (error: string | undefined) => {
        if (!error) return false;
        const systemKeywords = ['OpenSSL', 'Permission denied', 'cURL error', 'SQLSTATE', 'No such file', 'ZipArchive', 'failed to open stream'];
        return systemKeywords.some(kw => error.toLowerCase().includes(kw.toLowerCase()));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Detalles de Solicitud</h2>
                        <div className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">ID: {request.id}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-all"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente / RFC</label>
                            <div className="font-bold text-gray-900">{request.business_name}</div>
                            <div className="text-sm font-mono text-[#10B981]">{request.rfc}</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Periodo</label>
                            <div className="text-sm font-medium text-gray-700">
                                {new Date(request.start_date).toLocaleDateString()} — {new Date(request.end_date).toLocaleDateString()}
                            </div>
                            <div className={`text-[10px] font-black uppercase inline-block px-2 py-0.5 rounded ${request.type === 'issued' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                {request.type === 'issued' ? 'Emitidas' : 'Recibidas'}
                            </div>
                        </div>
                    </div>

                    {/* Status & Stats */}
                    <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 grid grid-cols-3 gap-4">
                        <div className="text-center">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado SAT</div>
                            <div className={`font-black text-sm uppercase ${request.state === 'completed' ? 'text-emerald-500' : request.state === 'failed' ? 'text-red-500' : 'text-orange-500'}`}>
                                {request.state}
                            </div>
                        </div>
                        <div className="text-center border-x border-gray-100 px-4">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Conceptos</div>
                            <div className="font-black text-lg text-gray-900">{request.xml_count} <span className="text-[10px] font-bold text-gray-400">XMLs</span></div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Intentos</div>
                            <div className="font-black text-lg text-gray-900">{request.attempts}</div>
                        </div>
                    </div>

                    {/* Error Information */}
                    {request.last_error && (
                        <div className={`p-6 rounded-2xl border ${isSystemError(request.last_error) ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
                            <div className="flex items-center gap-3 mb-4">
                                <span className={`material-symbols-outlined ${isSystemError(request.last_error) ? 'text-red-500' : 'text-orange-500'}`}>
                                    {isSystemError(request.last_error) ? 'dangerous' : 'warning'}
                                </span>
                                <div>
                                    <h4 className={`text-sm font-black uppercase tracking-tight ${isSystemError(request.last_error) ? 'text-red-900' : 'text-orange-900'}`}>
                                        {isSystemError(request.last_error) ? 'Error del Sistema (Acción Requerida)' : 'Aviso del SAT / Temporal'}
                                    </h4>
                                    <p className="text-[10px] font-medium text-gray-500">Origen del problema detectado automáticamente</p>
                                </div>
                            </div>
                            <div className="bg-white/50 rounded-xl p-4 font-mono text-xs text-gray-700 border border-current/10 break-words leading-relaxed">
                                {request.last_error}
                            </div>

                            {isSystemError(request.last_error) && (
                                <div className="mt-4 flex items-center gap-2 text-red-700">
                                    <span className="material-symbols-outlined text-sm">info</span>
                                    <span className="text-[10px] font-black uppercase tracking-wide">
                                        Sugerencia: Revisar permisos de archivos o configuración SSL en el servidor.
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {!request.last_error && request.state === 'completed' && (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                                <span className="material-symbols-outlined">check</span>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Sincronización Exitosa</h4>
                                <p className="text-xs text-emerald-600 font-medium">Todos los documentos fueron descargados y procesados sin errores.</p>
                            </div>
                        </div>
                    )}

                    {/* Timestamps */}
                    <div className="pt-6 border-t border-gray-50 flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <div>Creado: {formatDate(request.created_at)}</div>
                        <div>Actualizado: {formatDate(request.updated_at)}</div>
                    </div>
                </div>

                <div className="p-8 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-gray-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-lg active:scale-95"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
