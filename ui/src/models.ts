export interface Cfdi {
    id: number;
    uuid: string;
    serie?: string;
    folio?: string;
    rfc_emisor: string;
    rfc_receptor: string;
    name_emisor?: string;
    name_receptor?: string;
    fecha: string;
    tipo: 'I' | 'E' | 'T' | 'N' | 'P';
    subtotal?: number;
    descuento?: number;
    metodo_pago?: string;
    forma_pago?: string;
    uso_cfdi?: string;
    total: number;
    moneda?: string;
    tipo_cambio?: number;
    concepto?: string;
    iva?: number;
    retenciones?: number;
    path_xml: string;
    request_id: string;
    estado_sat?: string;
    es_cancelado?: number;
    fecha_cancelacion?: string;
    estado_sat_updated_at?: string;
    es_cancelable?: string;
    estatus_cancelacion?: string;
    validacion_efos?: string;
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

export interface Account {
    id: number;
    internal_code: string;
    sat_code: string;
    name: string;
    level: number;
    type: string;
    naturaleza: string;
    parent_code?: string;
    is_selectable: boolean;
    created_at?: string;
    updated_at?: string;
}
