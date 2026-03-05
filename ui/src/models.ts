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

export type ReconciliationConfidence = 'green' | 'yellow' | 'red' | 'black';

export interface ReconciliationSuggestion {
    cfdi_id: number;
    uuid: string;
    rfc_emisor: string;
    rfc_receptor: string;
    name_emisor?: string;
    name_receptor?: string;
    fecha: string;
    fecha_pago?: string;
    forma_pago?: string;
    total: number;
    tipo: 'I' | 'E' | 'P';
    confidence: ReconciliationConfidence;
    days_diff: number;
    match_via: 'total' | 'payment';
    payment_uuid?: string;
    monto_pagado?: number;
    related_invoices?: string[];   // UUIDs of invoices covered by this REP
    payments_count?: number;       // how many invoices this REP covers
}

export interface ReconciliationStats {
    total: number;
    green: number;
    yellow: number;
    red: number;
    unmatched: number;
}

export interface BankMovement {
    id: number;
    bank_statement_id: number;
    date: string;
    description: string;
    reference?: string;
    cargo: number;
    abono: number;
    saldo: number;
    cfdi_id?: number | null;
    confidence?: ReconciliationConfidence | null;
    reconciled_at?: string | null;
    is_reviewed: boolean;
    cfdi?: Cfdi | null;
    suggestions?: ReconciliationSuggestion[];
    _confidence_preview?: ReconciliationConfidence;
}

export interface BankStatement {
    id: number;
    business_id: number;
    bank_name: string;
    account_number: string;
    period: string;
    total_cargos: number;
    total_abonos: number;
    initial_balance: number;
    final_balance: number;
    file_name?: string;
    movements?: BankMovement[];
    movements_count?: number;
    created_at: string;
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
    is_postable: boolean;
    generate_auxiliaries: boolean;
    currency: string;
    is_cash_flow: boolean;
    is_active: boolean;
    is_custom: boolean;
    balance: number;
    description?: string;
    created_at?: string;
    updated_at?: string;
    // UI fields
    children?: Account[];
}

export interface SatRequest {
    id: string;
    rfc: string;
    business_name: string;
    type: string;
    start_date: string;
    end_date: string;
    state: string;
    sat_status?: string;
    package_count: number;
    xml_count: number;
    attempts: number;
    last_error?: string;
    created_at: string;
    updated_at: string;
    next_retry_at?: string;
}
