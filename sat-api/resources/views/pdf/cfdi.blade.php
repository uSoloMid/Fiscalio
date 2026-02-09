<!DOCTYPE html>
<html lang="es">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>Factura_{{ $cfdi['uuid'] }}</title>
    <style>
        @page { margin: 0; }
        body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            font-size: 8pt; 
            color: #1e293b; 
            margin: 0; 
            padding: 0;
            line-height: 1.4;
            background: #fff;
        }
        .main-container { padding: 40px; }
        
        /* Top Accent Bar */
        .top-bar { height: 8px; background: #0f172a; width: 100%; }

        table { width: 100%; border-collapse: collapse; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-bold { font-weight: 700; color: #0f172a; }
        .uppercase { text-transform: uppercase; }
        
        /* Header Layout */
        .header-section { margin-bottom: 30px; }
        .logo-box { width: 180px; height: 60px; background: #f1f5f9; border-radius: 8px; text-align: center; line-height: 60px; color: #64748b; font-weight: bold; font-size: 14pt; }
        
        .invoice-type-badge {
            display: inline-block;
            background: #0f172a;
            color: #fff;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 9pt;
            font-weight: bold;
            margin-bottom: 8px;
        }

        .metadata-box { text-align: right; }
        .uuid-text { font-family: monospace; font-size: 7.5pt; color: #64748b; }

        /* Address Sections */
        .address-container { margin-bottom: 30px; display: table; width: 100%; }
        .address-box { display: table-cell; width: 50%; vertical-align: top; }
        .address-title { 
            font-size: 7pt; 
            font-weight: 800; 
            color: #64748b; 
            text-transform: uppercase; 
            letter-spacing: 0.1em; 
            margin-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            margin-right: 20px;
        }
        .address-content { padding-right: 20px; }

        /* Concepts Table */
        .concepts-table { margin-top: 20px; border-radius: 8px; overflow: hidden; }
        .concepts-table th { 
            background: #f8fafc; 
            color: #475569; 
            padding: 10px 8px; 
            font-size: 7.5pt; 
            text-align: left;
            border-bottom: 2px solid #e2e8f0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .concepts-table td { 
            padding: 10px 8px; 
            border-bottom: 1px solid #f1f5f9; 
            vertical-align: top;
            color: #334155;
        }
        .concepts-table tr:nth-child(even) { background: #fbfcfd; }

        /* Totals section */
        .summary-section { margin-top: 30px; page-break-inside: avoid; }
        .amount-words { font-size: 7.5pt; color: #64748b; margin-top: 10px; font-style: italic; }
        
        .totals-table { width: 280px; float: right; }
        .totals-table td { padding: 4px 0; }
        .total-row { 
            font-size: 12pt; 
            font-weight: 900; 
            color: #0f172a;
            border-top: 2px solid #0f172a;
            padding-top: 8px !important;
        }

        /* SAT Timbre Section */
        .sat-section { 
            margin-top: 40px; 
            padding: 20px; 
            background: #f8fafc; 
            border-radius: 12px; 
            page-break-inside: avoid;
            border: 1px solid #e2e8f0;
        }
        .qr-cell { width: 140px; vertical-align: top; }
        .seals-cell { padding-left: 20px; vertical-align: top; }
        .seal-label { font-size: 6.5pt; font-weight: 800; color: #475569; display: block; margin-bottom: 2px; text-transform: uppercase; }
        .seal-text { font-family: monospace; font-size: 6pt; color: #64748b; word-break: break-all; margin-bottom: 10px; line-height: 1.2; display: block; }

        .footer { 
            position: absolute;
            bottom: 40px;
            left: 40px;
            right: 40px;
            text-align: center; 
            font-size: 7pt; 
            color: #94a3b8;
            border-top: 1px solid #f1f5f9;
            padding-top: 15px;
        }
        .clearfix::after { content: ""; clear: both; display: table; }
    </style>
</head>
<body>
    <div class="top-bar"></div>
    <div class="main-container">
        
        <!-- Header -->
        <table class="header-section">
            <tr>
                <td width="50%">
                    <div class="logo-box">FISCALIO</div>
                    <div style="margin-top: 15px;">
                        <div style="font-size: 12pt; font-weight: 900; color: #0f172a;">{{ $cfdi['emisor']['nombre'] }}</div>
                        <div style="font-weight: bold; color: #475569;">{{ $cfdi['emisor']['rfc'] }}</div>
                        <div style="font-size: 7.5pt; color: #64748b;">REGIMEN: {{ $cfdi['emisor']['regimen'] }}</div>
                    </div>
                </td>
                <td width="50%" class="metadata-box">
                    <div class="invoice-type-badge">{{ $cfdi['tipo_descripcion'] }}</div>
                    <div style="font-size: 14pt; font-weight: 900; color: #0f172a;">{{ $cfdi['serie'] }}{{ $cfdi['folio'] }}</div>
                    <div style="margin-top: 10px;">
                        <div class="text-bold" style="font-size: 7.5pt;">FECHA DE EMISIÓN</div>
                        <div>{{ $cfdi['fecha'] }}</div>
                    </div>
                    <div style="margin-top: 8px;">
                        <span class="text-bold" style="font-size: 7.5pt;">LUGAR DE EXPEDICIÓN:</span> {{ $cfdi['lugar_expedicion'] }}
                    </div>
                </td>
            </tr>
        </table>

        <!-- Client Info & UUID -->
        <div class="address-container">
            <div class="address-box">
                <div class="address-title">Receptor / Cliente</div>
                <div class="address-content">
                    <div class="text-bold" style="font-size: 10pt;">{{ $cfdi['receptor']['nombre'] }}</div>
                    <div class="text-bold" style="color: #475569;">{{ $cfdi['receptor']['rfc'] }}</div>
                    <div style="margin-top: 5px; font-size: 7.5pt; color: #64748b;">
                        USO CFDI: <span class="text-bold">{{ $cfdi['receptor']['uso'] }}</span><br>
                        DOMICILIO: {{ $cfdi['receptor']['domicilio'] ?: 'N/A' }}<br>
                        RÉGIMEN: {{ $cfdi['receptor']['regimen'] ?: 'N/A' }}
                    </div>
                </div>
            </div>
            <div class="address-box">
                <div class="address-title">Información Fiscal</div>
                <div class="address-content">
                    <div style="margin-bottom: 5px;">
                        <span class="text-bold" style="font-size: 6.5pt; color: #94a3b8; display: block; text-transform: uppercase;">Folio Fiscal (UUID)</span>
                        <span class="uuid-text" style="font-size: 9pt; color: #0f172a; font-weight: bold;">{{ $cfdi['uuid'] }}</span>
                    </div>
                    <table style="font-size: 7pt; color: #64748b;">
                        <tr>
                            <td width="60%">No. Certificado SAT:</td>
                            <td class="text-right text-bold">{{ $cfdi['no_certificado_sat'] ?: 'N/A' }}</td>
                        </tr>
                        <tr>
                            <td>No. Certificado Emisor:</td>
                            <td class="text-right text-bold">{{ $cfdi['no_certificado_emisor'] ?: 'N/A' }}</td>
                        </tr>
                        <tr>
                            <td>Fecha Certificación:</td>
                            <td class="text-right text-bold">{{ $cfdi['fecha_timbrado'] ?: 'N/A' }}</td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>

        <!-- Concepts -->
        <table class="concepts-table">
            <thead>
                <tr>
                    <th width="8%">Cant</th>
                    <th width="12%">Clave SAT</th>
                    <th>Descripción</th>
                    <th width="15%" class="text-right">Precio Unit</th>
                    <th width="15%" class="text-right">Importe</th>
                </tr>
            </thead>
            <tbody>
                @foreach($cfdi['conceptos'] as $con)
                <tr>
                    <td>{{ $con['cantidad'] }}</td>
                    <td>{{ $con['clave_prod_serv'] }}</td>
                    <td>
                        <div class="text-bold">{{ $con['descripcion'] }}</div>
                        <div style="font-size: 7pt; color: #94a3b8;">Unidad: {{ $con['clave_unidad'] }} - {{ $con['unidad'] }}</div>
                    </td>
                    <td class="text-right">${{ number_format((float)$con['valor_unitario'], 2) }}</td>
                    <td class="text-right">${{ number_format((float)$con['importe'], 2) }}</td>
                </tr>
                @endforeach
            </tbody>
        </table>

        <!-- Totals & Amount in words -->
        <div class="summary-section clearfix">
            <div style="width: 50%; float: left;">
                <div class="amount-words">
                    <span class="text-bold" style="font-size: 7pt; color: #94a3b8; text-transform: uppercase;">Importe con letra:</span><br>
                    <span style="color: #334155; font-weight: bold;">{{ $cfdi['total_letra'] }}</span>
                </div>
                <div style="margin-top: 15px; font-size: 7pt; color: #64748b;">
                    MONEDA: <span class="text-bold">{{ $cfdi['moneda'] }}</span><br>
                    FORMA DE PAGO: <span class="text-bold">{{ $cfdi['forma_pago'] ?? '01' }}</span><br>
                    MÉTODO DE PAGO: <span class="text-bold">{{ $cfdi['metodo_pago'] ?? 'PUE' }}</span>
                </div>
            </div>
            <div style="width: 50%; float: right;">
                <table class="totals-table text-right">
                    <tr>
                        <td style="color: #64748b;">Subtotal</td>
                        <td width="100" class="text-bold">${{ number_format((float)$cfdi['subtotal'], 2) }}</td>
                    </tr>
                    @if($cfdi['descuento'] > 0)
                    <tr>
                        <td style="color: #64748b;">Descuento</td>
                        <td class="text-bold">- ${{ number_format((float)$cfdi['descuento'], 2) }}</td>
                    </tr>
                    @endif
                    @foreach($cfdi['traslados'] as $imp)
                    <tr>
                        <td style="color: #64748b;">Traslado {{ $imp['impuesto'] }} ({{ $imp['tasa'] }})</td>
                        <td class="text-bold">${{ number_format((float)$imp['importe'], 2) }}</td>
                    </tr>
                    @endforeach
                    @foreach($cfdi['retenciones'] as $imp)
                    <tr>
                        <td style="color: #64748b;">Retención {{ $imp['impuesto'] }}</td>
                        <td class="text-bold" style="color: #ef4444;">- ${{ number_format((float)$imp['importe'], 2) }}</td>
                    </tr>
                    @endforeach
                    <tr class="total-row">
                        <td>TOTAL</td>
                        <td>${{ number_format((float)$cfdi['total'], 2) }}</td>
                    </tr>
                </table>
            </div>
        </div>

        <!-- Timbre SAT -->
        <div class="sat-section">
            <table>
                <tr>
                    <td class="qr-cell">
                        @if(!empty($qrCode))
                            <img src="data:image/png;base64,{{ $qrCode }}" width="120" height="120" style="display: block;"/>
                        @endif
                    </td>
                    <td class="seals-cell">
                        <span class="seal-label">Sello Digital del CFDI</span>
                        <span class="seal-text">{{ wordwrap($cfdi['sello_cfd'], 140, " ", true) }}</span>
                        
                        <span class="seal-label">Sello Digital del SAT</span>
                        <span class="seal-text">{{ wordwrap($cfdi['sello_sat'] ?? 'N/A', 140, " ", true) }}</span>
                        
                        <span class="seal-label">Cadena Original del Complemento de Certificación Digital del SAT</span>
                        <span class="seal-text">{{ wordwrap($cfdi['cadena_original'] ?? 'N/A', 140, " ", true) }}</span>
                    </td>
                </tr>
            </table>
        </div>

        <div class="footer">
            Este documento es una representación impresa de un CFDI versión {{ $cfdi['version'] }}. <br>
            Generado por <strong>Fiscalio</strong> - El software contable más avanzado.
        </div>
    </div>
</body>
</html>
