export interface Cfdi {
    id: number;
    uuid: string;
    rfc_emisor: string;
    rfc_receptor: string;
    name_emisor?: string;
    name_receptor?: string;
    fecha: string;
    tipo: 'I' | 'E' | 'T' | 'N' | 'P';
    total: number;
    subtotal?: number;
    concepto?: string;
    iva?: number;
    retenciones?: number;
    path_xml: string;
    request_id: string;
    estado_sat?: string;
    es_cancelado?: number;
    fecha_cancelacion?: string;
    estado_sat_updated_at?: string;
    created_at: string;
    updated_at: string;
}

export interface CfdiPagination {
    current_page: number;
    data: Cfdi[];
    first_page_url: string;
    from: number;
    last_page: number;
    last_page_url: string;
    links: { url: string | null; label: string; active: boolean }[];
    next_page_url: string | null;
    path: string;
    per_page: number;
    prev_page_url: string | null;
    to: number;
    total: number;
}
