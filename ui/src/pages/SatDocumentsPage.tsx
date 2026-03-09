import { useState, useEffect, useCallback, useMemo } from 'react';
import { listSatDocuments, triggerScraperFiel, authFetch } from '../services';
import { API_BASE_URL } from '../api/config';

interface SatDoc {
    id: number;
    type: 'csf' | 'opinion_32d';
    file_size: number | null;
    opinion_result: 'positive' | 'negative' | null;
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

function monthKey(iso: string) {
    // e.g. "2026-03"
    return iso.substring(0, 7);
}

function monthLabel(key: string) {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function OpinionBadge({ result }: { result: 'positive' | 'negative' | null }) {
    if (result === 'positive') return (
        <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-xl uppercase tracking-wide">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Positivo
        </span>
    );
    if (result === 'negative') return (
        <span className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-black rounded-xl uppercase tracking-wide">
            <span className="material-symbols-outlined text-sm">cancel</span>
            Negativo
        </span>
    );
    return (
        <span className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-xl">
            <span className="material-symbols-outlined text-sm">help_outline</span>
            Sin clasificar
        </span>
    );
}

function DocCard({
    doc,
    onDownload,
    onView,
}: {
    doc: SatDoc;
    onDownload: (doc: SatDoc) => void;
    onView: (doc: SatDoc) => void;
}) {
    const isOpinion = doc.type === 'opinion_32d';
    const isNegative = doc.opinion_result === 'negative';

    return (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${isNegative ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}>
            <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined text-xl ${isNegative ? 'text-red-500' : 'text-red-400'}`}>picture_as_pdf</span>
                <div>
                    <p className="text-sm font-semibold text-gray-800">{formatDate(doc.requested_at)}</p>
                    {doc.file_size && <p className="text-xs text-gray-400">{formatSize(doc.file_size)}</p>}
                </div>
                {isOpinion && <OpinionBadge result={doc.opinion_result} />}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onView(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Ver
                </button>
                <button
                    onClick={() => onDownload(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Descargar
                </button>
            </div>
        </div>
    );
}

export function SatDocumentsPage({ activeRfc, clientName, onBack }: Props) {
    const [docs, setDocs] = useState<SatDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [viewingDoc, setViewingDoc] = useState<SatDoc | null>(null);
    const [viewBlobUrl, setViewBlobUrl] = useState<string | null>(null);

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

    // Derive available months from docs (sorted descending)
    const availableMonths = useMemo(() => {
        const months = new Set(docs.map(d => monthKey(d.requested_at)));
        return [...months].sort().reverse();
    }, [docs]);

    // Auto-select latest month
    useEffect(() => {
        if (availableMonths.length > 0 && !selectedMonth) {
            setSelectedMonth(availableMonths[0]);
        }
    }, [availableMonths, selectedMonth]);

    // Filter docs by selected month
    const filteredDocs = useMemo(() => {
        if (!selectedMonth) return docs;
        return docs.filter(d => monthKey(d.requested_at) === selectedMonth);
    }, [docs, selectedMonth]);

    const csfDocs = filteredDocs.filter(d => d.type === 'csf');
    const opinionDocs = filteredDocs.filter(d => d.type === 'opinion_32d');

    // Summary stats
    const latestOpinion = docs.find(d => d.type === 'opinion_32d');
    const opinionStatus = latestOpinion?.opinion_result;

    const handleDownload = async (doc: SatDoc) => {
        const label = doc.type === 'csf' ? 'Constancia_Situacion_Fiscal' : 'Opinion_Cumplimiento_32D';
        const date = new Date(doc.requested_at).toISOString().split('T')[0];
        const filename = `${label}_${activeRfc}_${date}.pdf`;
        try {
            const response = await authFetch(`${API_BASE_URL}/api/sat-documents/${doc.id}/download`);
            if (!response.ok) throw new Error('Error en descarga');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            alert('Error al descargar: ' + e.message);
        }
    };

    const handleView = async (doc: SatDoc) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/api/sat-documents/${doc.id}/download?inline=1`);
            if (!response.ok) throw new Error('Error');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            if (viewBlobUrl) URL.revokeObjectURL(viewBlobUrl);
            setViewBlobUrl(url);
            setViewingDoc(doc);
        } catch {
            alert('No se pudo abrir el documento');
        }
    };

    // Cleanup blob URL on close
    const handleCloseViewer = () => {
        setViewingDoc(null);
        if (viewBlobUrl) { URL.revokeObjectURL(viewBlobUrl); setViewBlobUrl(null); }
    };

    const handleScrape = async () => {
        setScraping(true);
        try {
            await triggerScraperFiel(activeRfc);
            alert('Solicitud enviada al agente. Los documentos aparecerán aquí en unos minutos.');
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

                {/* Latest opinion status pill */}
                {latestOpinion && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${opinionStatus === 'positive' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : opinionStatus === 'negative' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        <span className="material-symbols-outlined text-sm">
                            {opinionStatus === 'positive' ? 'verified' : opinionStatus === 'negative' ? 'gpp_bad' : 'help_outline'}
                        </span>
                        Opinión actual: {opinionStatus === 'positive' ? 'POSITIVO' : opinionStatus === 'negative' ? 'NEGATIVO' : 'Sin clasificar'}
                    </div>
                )}

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
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all shadow-sm ${scraping ? 'bg-orange-50 border border-orange-100 text-orange-600' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
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
                    {/* Month filter */}
                    {availableMonths.length > 0 && (
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Periodo:</span>
                            {availableMonths.map(m => (
                                <button
                                    key={m}
                                    onClick={() => setSelectedMonth(m)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all capitalize ${selectedMonth === m ? 'bg-gray-900 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                >
                                    {monthLabel(m)}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* CSF section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="material-symbols-outlined text-2xl text-blue-500">badge</span>
                            <h2 className="text-base font-bold text-gray-800">Constancia de Situación Fiscal</h2>
                            <span className="ml-auto text-xs text-gray-400">{csfDocs.length} doc{csfDocs.length !== 1 ? 's' : ''}</span>
                        </div>
                        {loading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Cargando...</p>
                        ) : csfDocs.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">
                                {selectedMonth ? `Sin CSF para ${monthLabel(selectedMonth)}.` : 'No hay CSF descargadas aún. Usa el botón "Robot FIEL" para solicitarlas.'}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {csfDocs.map(doc => (
                                    <DocCard key={doc.id} doc={doc} onDownload={handleDownload} onView={handleView} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Opinion 32-D section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="material-symbols-outlined text-2xl text-violet-500">verified</span>
                            <h2 className="text-base font-bold text-gray-800">Opinión de Cumplimiento 32-D</h2>
                            <span className="ml-auto text-xs text-gray-400">{opinionDocs.length} doc{opinionDocs.length !== 1 ? 's' : ''}</span>
                        </div>
                        {loading ? (
                            <p className="text-sm text-gray-400 py-4 text-center">Cargando...</p>
                        ) : opinionDocs.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">
                                {selectedMonth ? `Sin Opinión 32-D para ${monthLabel(selectedMonth)}.` : 'No hay Opiniones 32-D descargadas aún.'}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {opinionDocs.map(doc => (
                                    <DocCard key={doc.id} doc={doc} onDownload={handleDownload} onView={handleView} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PDF Viewer Modal */}
            {viewingDoc && viewBlobUrl && (
                <div className="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-red-500">picture_as_pdf</span>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">
                                        {viewingDoc.type === 'csf' ? 'Constancia de Situación Fiscal' : 'Opinión de Cumplimiento 32-D'}
                                    </p>
                                    <p className="text-xs text-gray-400">{formatDate(viewingDoc.requested_at)}</p>
                                </div>
                                {viewingDoc.type === 'opinion_32d' && <OpinionBadge result={viewingDoc.opinion_result} />}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownload(viewingDoc)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">download</span>
                                    Descargar
                                </button>
                                <button
                                    onClick={handleCloseViewer}
                                    className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>
                        <iframe
                            src={`${viewBlobUrl}#toolbar=1&view=FitH`}
                            className="flex-1 w-full"
                            title="Visor PDF"
                            style={{ border: 'none' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
