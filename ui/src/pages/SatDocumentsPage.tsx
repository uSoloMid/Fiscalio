import { useState, useEffect, useCallback } from 'react';
import { listSatDocuments, downloadSatDocument, triggerScraperFiel } from '../services';

interface SatDoc {
    id: number;
    type: 'csf' | 'opinion_32d';
    file_size: number | null;
    requested_at: string;
}

interface Props {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatSize(bytes: number | null) {
    if (!bytes) return '';
    return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function DocSection({
    title, icon, type, docs, onDownload,
}: {
    title: string;
    icon: string;
    type: 'csf' | 'opinion_32d';
    docs: SatDoc[];
    onDownload: (doc: SatDoc) => void;
}) {
    const filtered = docs.filter(d => d.type === type);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-2xl text-blue-500">{icon}</span>
                <h2 className="text-base font-bold text-gray-800">{title}</h2>
                <span className="ml-auto text-xs text-gray-400">{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    No hay documentos descargados aún. Usa el botón "Robot FIEL" para solicitarlos.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {filtered.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-lg text-red-500">picture_as_pdf</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-700">{formatDate(doc.requested_at)}</p>
                                    {doc.file_size && <p className="text-xs text-gray-400">{formatSize(doc.file_size)}</p>}
                                </div>
                            </div>
                            <button
                                onClick={() => onDownload(doc)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">download</span>
                                Descargar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function SatDocumentsPage({ activeRfc, clientName, onBack }: Props) {
    const [docs, setDocs] = useState<SatDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await listSatDocuments(activeRfc);
            setDocs(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [activeRfc]);

    useEffect(() => { load(); }, [load]);

    const handleDownload = async (doc: SatDoc) => {
        const label = doc.type === 'csf' ? 'Constancia_Situacion_Fiscal' : 'Opinion_Cumplimiento_32D';
        const date = new Date(doc.requested_at).toISOString().split('T')[0];
        const filename = `${label}_${activeRfc}_${date}.pdf`;
        try {
            await downloadSatDocument(doc.id, filename);
        } catch (e: any) {
            alert('Error al descargar: ' + e.message);
        }
    };

    const handleScrape = async () => {
        setScraping(true);
        try {
            await triggerScraperFiel(activeRfc);
            alert('Solicitud enviada al agente. Los documentos aparecerán en esta página en unos minutos una vez descargados.');
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setScraping(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shadow-sm flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Documentos SAT</h1>
                    <p className="text-xs text-gray-500">{clientName || activeRfc}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium"
                    >
                        <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Actualizar
                    </button>
                    <button
                        onClick={handleScrape}
                        disabled={scraping}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all shadow-sm ${
                            scraping
                                ? 'bg-orange-50 border border-orange-100 text-orange-600'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        <span className={`material-symbols-outlined text-base ${scraping ? 'animate-spin' : ''}`}>
                            {scraping ? 'downloading' : 'security'}
                        </span>
                        {scraping ? 'Solicitando...' : 'Robot FIEL — Solicitar docs'}
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
                        {error}
                    </div>
                )}

                <div className="max-w-3xl mx-auto flex flex-col gap-6">
                    <DocSection
                        title="Constancia de Situación Fiscal"
                        icon="badge"
                        type="csf"
                        docs={docs}
                        onDownload={handleDownload}
                    />
                    <DocSection
                        title="Opinión de Cumplimiento 32-D"
                        icon="verified"
                        type="opinion_32d"
                        docs={docs}
                        onDownload={handleDownload}
                    />
                </div>
            </div>
        </div>
    );
}
