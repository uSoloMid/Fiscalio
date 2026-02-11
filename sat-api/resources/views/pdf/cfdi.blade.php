<!DOCTYPE html>
<html lang="es">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>Factura_{{ $cfdis[0]['uuid'] }}</title>
    <style>
        @page { margin: 1cm; }
        body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            font-size: 7.5pt; 
            color: #000; 
            margin: 0; 
            padding: 0;
            line-height: 1.1;
            background: #fff;
        }
        table { width: 100%; border-collapse: collapse; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-bold { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
        
        .header-table td { vertical-align: top; }
        .logo-column { width: 25%; }
        .info-column { width: 50%; padding: 0 5px; }
        .meta-column { width: 25%; }

        .issuer-name { font-size: 11pt; font-weight: bold; display: block; margin-bottom: 2px; }
        .issuer-rfc { font-size: 8.5pt; display: block; margin-bottom: 2px; }
        .issuer-regimen { font-size: 7.5pt; display: block; margin-bottom: 1px; }

        .doc-title { font-size: 11pt; font-weight: bold; display: block; margin-bottom: 4px; }
        .meta-label { font-size: 7.5pt; font-weight: bold; display: block; text-transform: uppercase; margin-top: 3px; }
        .meta-value { font-size: 7.5pt; display: block; margin-bottom: 1px; }

        /* Cliente Section */
        .client-section-block { margin-top: 5px; }
        .client-title { font-size: 10pt; font-weight: bold; display: block; margin-bottom: 3px; }
        .client-name { font-size: 10pt; font-weight: bold; display: block; margin-bottom: 2px; }
        .client-details { font-size: 8pt; display: block; margin-bottom: 1px; }

        .concepts-table { margin-top: 15px; width: 100%; border: 1px solid #000; border-collapse: collapse; }
        .concepts-table th { border: 1px solid #000; padding: 4px; font-size: 7.5pt; text-transform: uppercase; text-align: left; }
        .concepts-header-title { background: #000; color: #fff; text-align: center !important; font-size: 8.5pt; padding: 5px; }
        .concepts-table td { padding: 4px; border: 1px solid #000; vertical-align: top; }
        
        .footer-section { margin-top: 20px; width: 100%; border-collapse: collapse; table-layout: fixed; }
        .footer-left { width: 70%; vertical-align: top; padding-right: 15px; }
        .footer-right { width: 30%; vertical-align: top; }

        .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .metadata-table td { padding: 1px 0; vertical-align: top; font-size: 7.8pt; }
        .metadata-label { font-weight: bold; width: 130px; text-transform: uppercase; }
        .metadata-value { color: #000; }

        .totals-table { width: 100%; border-collapse: collapse; }
        .totals-table td { padding: 2px 0; font-size: 8.5pt; text-align: left; vertical-align: bottom; }
        .totals-table td.symbol { width: 25px; text-align: right; padding-left: 5px; white-space: nowrap; }
        .totals-table td.amount { text-align: right; width: 80px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .total-row td { padding-top: 8px; font-size: 8.5pt; text-transform: uppercase; }
        .total-row td.amount { font-weight: bold; font-size: 10pt; }

        .sat-info-table { width: 100%; border-collapse: collapse; margin-top: 10px; border-top: 0.5px solid #eee; padding-top: 10px; }
        .qr-code { width: 102px; padding-right: 5px; vertical-align: top; }
        .seal-box { font-size: 5.5pt; word-break: break-all; vertical-align: top; line-height: 1.1; }
        .seal-title { font-weight: bold; display: block; margin-top: 5px; text-transform: uppercase; color: #000; }

        .footer { font-size: 7pt; text-align: center; margin-top: 25px; padding-top: 10px; color: #666; border-top: 0.5px solid #eee; }
    </style>
</head>
<body>
@foreach($cfdis as $idx => $cfdi)
    <div class="main-container" style="{{ $idx < count($cfdis) - 1 ? 'page-break-after: always;' : '' }}">
        
        <table class="header-table">
            <tr>
                <!-- Columna Izquierda: Logo (Espacio) -->
                <td class="logo-column">
                    <!-- Espacio para logo -->
                </td>

                <!-- Columna Central: Emisor y Cliente -->
                <td class="info-column text-center">
                    <span class="issuer-name uppercase">{{ $cfdi['emisor']['nombre'] }}</span>
                    <span class="issuer-rfc">{{ $cfdi['emisor']['rfc'] }}</span>
                    <span class="issuer-regimen">RÉGIMEN FISCAL: {{ $cfdi['emisor']['regimen_desc'] }}</span>
                    <span class="issuer-regimen" style="font-size: 6.5pt;">CP {{ $cfdi['lugar_expedicion'] }}</span>
                    
                    <div class="client-section-block">
                        <span class="client-title uppercase">CLIENTE</span>
                        <span class="client-name uppercase">{{ $cfdi['receptor']['nombre'] }}</span>
                        <span class="client-details uppercase">{{ $cfdi['receptor']['rfc'] }}</span>
                        <span class="client-details">USO CFDI: {{ $cfdi['receptor']['uso_desc'] }}</span>
                        <span class="client-details">DOMICILIO FISCAL: {{ $cfdi['receptor']['domicilio'] }}</span>
                        <span class="client-details">RÉGIMEN FISCAL: {{ $cfdi['receptor']['regimen_desc'] }}</span>
                    </div>
                </td>

                <!-- Columna Derecha: Información Fiscal -->
                <td class="meta-column text-right">
                    <span class="doc-title uppercase">{{ $cfdi['tipo_descripcion'] }} {{ $cfdi['serie'] }}{{ $cfdi['folio'] }}</span>
                    
                    <span class="meta-label">FOLIO FISCAL (UUID)</span>
                    <span class="meta-value uppercase">{{ $cfdi['uuid'] }}</span>
                    
                    <span class="meta-label">NO. DE SERIE DEL CERTIFICADO DEL SAT</span>
                    <span class="meta-value">{{ $cfdi['no_certificado_sat'] }}</span>
                    
                    <span class="meta-label">NO. DE SERIE DEL CERTIFICADO DEL EMISOR</span>
                    <span class="meta-value">{{ $cfdi['no_certificado_emisor'] }}</span>
                    
                    <span class="meta-label">FECHA Y HORA DE CERTIFICACIÓN</span>
                    <span class="meta-value">{{ $cfdi['fecha_timbrado'] }}</span>
                    
                    <span class="meta-label">RFC PROVEEDOR DE CERTIFICACIÓN</span>
                    <span class="meta-value">{{ $cfdi['rfc_prov_certif'] }}</span>
                    
                    <span class="meta-label">FECHA Y HORA DE EMISIÓN DE CFDI</span>
                    <span class="meta-value">{{ $cfdi['fecha'] }}</span>
                    
                    <span class="meta-label">LUGAR DE EXPEDICIÓN</span>
                    <span class="meta-value">{{ $cfdi['lugar_expedicion'] }}</span>
                </td>
            </tr>
        </table>
        
        <!-- CFDI Relacionados -->
        @if($cfdi['relacionados'])
            <table class="related-table">
                <tr>
                    <td class="related-header">
                        CFDI'S RELACIONADOS (RELACIÓN: {{ mb_strtoupper($cfdi['relacionados']['tipo_desc']) }})
                    </td>
                </tr>
                <tr>
                    <td class="related-content">
                        @foreach($cfdi['relacionados']['uuids'] as $ruuid)
                            {{ $ruuid }}<br>
                        @endforeach
                    </td>
                </tr>
            </table>
        @endif

        <!-- Concepts / Payment Details -->
        @if($cfdi['tipo_comprobante'] === 'P')
            <div style="margin-top: 20px;">
                <div class="address-title">Detalle del Complemento de Pago</div>
                @foreach($cfdi['pagos'] as $pago)
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                        <table style="font-size: 8pt; margin-bottom: 10px;">
                            <tr>
                                <td width="25%"><span class="text-bold">FECHA PAGO:</span><br>{{ $pago['fecha_pago'] }}</td>
                                <td width="25%"><span class="text-bold">FORMA PAGO:</span><br>{{ $pago['forma_pago'] }}</td>
                                <td width="25%"><span class="text-bold">MONEDA:</span><br>{{ $pago['moneda'] }}</td>
                                <td width="25%"><span class="text-bold">MONTO:</span><br><span style="font-size: 10pt;">${{ number_format((float)$pago['monto'], 2) }}</span></td>
                            </tr>
                        </table>
                        
                        <div class="text-bold" style="font-size: 7pt; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Documentos Relacionados</div>
                        <table class="concepts-table" style="margin-top: 0;">
                            <thead>
                                <tr>
                                    <th>Folio / UUID</th>
                                    <th class="text-center">Parc.</th>
                                    <th class="text-right">S. Anterior</th>
                                    <th class="text-right">Pagado</th>
                                    <th class="text-right">S. Insoluto</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($pago['doctos_relacionados'] as $doc)
                                    <tr>
                                        <td style="font-size: 7pt;">
                                            @if($doc['serie'] || $doc['folio'])
                                                <div class="text-bold">{{ $doc['serie'] }}{{ $doc['folio'] }}</div>
                                            @endif
                                            <div style="color: #64748b; font-family: monospace;">{{ $doc['uuid'] }}</div>
                                        </td>
                                        <td class="text-center">{{ $doc['num_parcialidad'] }}</td>
                                        <td class="text-right">${{ number_format((float)$doc['saldo_anterior'], 2) }}</td>
                                        <td class="text-right text-bold">${{ number_format((float)$doc['importe_pagado'], 2) }}</td>
                                        <td class="text-right">${{ number_format((float)$doc['saldo_insoluto'], 2) }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @endforeach
            </div>
        @else
            <table class="concepts-table">
                <thead>
                    <tr>
                        <th colspan="7" class="concepts-header-title">CONCEPTOS</th>
                    </tr>
                    <tr>
                        <th width="7%" class="text-right">CANTIDAD</th>
                        <th width="10%">UNIDAD</th>
                        <th width="12%">NO. IDENTIFICACIÓN</th>
                        <th>DESCRIPCIÓN</th>
                        <th width="12%" class="text-right">PRECIO UNITARIO</th>
                        <th width="12%">OBJETO IMP.</th>
                        <th width="12%" class="text-right">IMPORTE</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($cfdi['conceptos'] as $con)
                    <tr>
                        <td class="text-right">{{ number_format((float)$con['cantidad'], 2) }}</td>
                        <td class="uppercase">{{ $con['clave_unit'] }} - {{ $con['unidad'] }}</td>
                        <td>{{ $con['no_identificacion'] }}</td>
                        <td>
                            <div class="uppercase text-bold">{{ $con['descripcion'] }}</div>
                            <div style="font-size: 6.5pt; margin-top: 2px; color: #333;">
                                Clave Prod. Serv. - {{ $con['clave_prod_serv'] }}<br>
                                No. Identificación - {{ $con['no_identificacion'] }}
                            </div>
                            
                            @if(count($con['traslados']) > 0 || count($con['retenciones']) > 0)
                                <div style="font-size: 6.5pt; margin-top: 5px; color: #000;">
                                    <span class="text-bold">Impuestos:</span><br>
                                    @if(count($con['traslados']) > 0)
                                        <div style="padding-left: 5px;">Traslados:</div>
                                        @foreach($con['traslados'] as $t)
                                            <div style="padding-left: 10px;">{{ $t['impuesto'] }} {{ $t['impuesto_desc'] }} Base - {{ number_format((float)$t['base'], 2) }} Tasa - {{ $t['tasa'] }} Importe - ${{ number_format((float)$t['importe'], 2) }}</div>
                                        @endforeach
                                    @endif
                                    @if(count($con['retenciones']) > 0)
                                        <div style="padding-left: 5px;">Retenciones:</div>
                                        @foreach($con['retenciones'] as $r)
                                            <div style="padding-left: 10px;">{{ $r['impuesto'] }} {{ $r['impuesto_desc'] }} Base - {{ number_format((float)$r['base'], 2) }} Tasa - {{ $r['tasa'] }} Importe - ${{ number_format((float)$r['importe'], 2) }}</div>
                                        @endforeach
                                    @endif
                                </div>
                            @endif
                        </td>
                        <td class="text-right">${{ number_format((float)$con['valor_unitario'], 2) }}</td>
                        <td style="font-size: 6.5pt;">{{ $con['objeto_imp_desc'] }}</td>
                        <td class="text-right">${{ number_format((float)$con['importe'], 2) }}</td>
                    </tr>
                    @endforeach
                </tbody>
            </table>
        @endif

        <!-- Multi-column Footer Section -->
        <table class="footer-section">
            <tr>
                <!-- Left Column: Metadata and Seals -->
                <td class="footer-left">
                    <table class="metadata-table">
                        <tr>
                            <td class="metadata-label">IMPORTE CON LETRA</td>
                            <td class="metadata-value uppercase">{{ $cfdi['total_letra'] }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">TIPO DE COMPROBANTE</td>
                            <td class="metadata-value uppercase">{{ $cfdi['tipo_descripcion'] }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">FORMA DE PAGO</td>
                            <td class="metadata-value uppercase">{{ $cfdi['forma_pago'] }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">MÉTODO DE PAGO</td>
                            <td class="metadata-value uppercase">{{ $cfdi['metodo_pago'] ?? 'PUE' }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">MONEDA</td>
                            <td class="metadata-value uppercase">{{ $cfdi['moneda_desc'] }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">VERSIÓN</td>
                            <td class="metadata-value">{{ $cfdi['version'] }}</td>
                        </tr>
                        <tr>
                            <td class="metadata-label">EXPORTACIÓN</td>
                            <td class="metadata-value uppercase">{{ $cfdi['exportacion'] }}</td>
                        </tr>
                    </table>

                    <!-- Timbre SAT integrated in left column -->
                    <table class="sat-info-table">
                        <tr>
                            <td class="qr-code">
                                @if(!empty($cfdi['qrCode']))
                                    <img src="data:image/svg+xml;base64,{{ $cfdi['qrCode'] }}" width="100" height="100"/>
                                @endif
                            </td>
                            <td class="seal-box">
                                <span class="seal-title">SELLO DIGITAL DEL CFDI</span>
                                {{ wordwrap($cfdi['sello_cfd'], 130, " ", true) }}
                                
                                <span class="seal-title">SELLO DIGITAL DEL SAT</span>
                                {{ wordwrap($cfdi['sello_sat'] ?? 'N/A', 130, " ", true) }}
                                
                                <span class="seal-title">CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT</span>
                                {{ wordwrap($cfdi['cadena_original'] ?? 'N/A', 130, " ", true) }}
                            </td>
                        </tr>
                    </table>
                </td>

                <!-- Right Column: Totals -->
                <td class="footer-right">
                    <table class="totals-table">
                        <tr>
                            <td>SUBTOTAL</td>
                            <td class="symbol">$</td>
                            <td class="amount">{{ number_format((float)$cfdi['subtotal'], 2) }}</td>
                        </tr>
                        @if($cfdi['descuento'] > 0)
                        <tr>
                            <td>DESCUENTO</td>
                            <td class="symbol">-$</td>
                            <td class="amount">{{ number_format((float)$cfdi['descuento'], 2) }}</td>
                        </tr>
                        @endif
                        @foreach($cfdi['traslados'] as $imp)
                        <tr>
                            <td class="uppercase">IVA ({{ (float)$imp['tasa'] * 100 }}%)</td>
                            <td class="symbol">$</td>
                            <td class="amount">{{ number_format((float)$imp['importe'], 2) }}</td>
                        </tr>
                        @endforeach
                        @foreach($cfdi['retenciones'] as $imp)
                        <tr>
                            <td class="uppercase">RET. {{ $imp['impuesto_desc'] }}</td>
                            <td class="symbol">-$</td>
                            <td class="amount">{{ number_format((float)$imp['importe'], 2) }}</td>
                        </tr>
                        @endforeach
                        @foreach($cfdi['impuestos_locales']['traslados'] as $imp)
                        <tr>
                            <td class="uppercase">{{ $imp['nombre'] }} ({{ (float)$imp['tasa'] }}%)</td>
                            <td class="symbol">$</td>
                            <td class="amount">{{ number_format((float)$imp['importe'], 2) }}</td>
                        </tr>
                        @endforeach
                        @foreach($cfdi['impuestos_locales']['retenciones'] as $imp)
                        <tr>
                            <td class="uppercase">RET. LOCAL {{ $imp['nombre'] }} ({{ (float)$imp['tasa'] }}%)</td>
                            <td class="symbol">-$</td>
                            <td class="amount">{{ number_format((float)$imp['importe'], 2) }}</td>
                        </tr>
                        @endforeach
                        <tr class="total-row">
                            <td>TOTAL</td>
                            <td class="symbol">$</td>
                            <td class="amount">{{ number_format((float)$cfdi['total'], 2) }}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <div class="footer">
            Este documento es una representación impresa de un CFDI versión {{ $cfdi['version'] }}. <br>
            Generado por Fiscalio.
        </div>
    </div>
@endforeach
</body>
</html>
