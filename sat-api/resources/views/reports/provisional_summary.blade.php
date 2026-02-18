<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Reporte Provisional - {{ $clientName }}</title>
    <style>
        @page {
            margin: 1cm;
        }
        body {
            font-family: 'Helvetica', sans-serif;
            color: #333;
            font-size: 10px;
        }
        .header {
            margin-bottom: 20px;
            border-bottom: 2px solid #10b981;
            padding-bottom: 10px;
        }
        .header h1 {
            color: #10b981;
            margin: 0;
            font-size: 18px;
        }
        .header .client {
            font-size: 14px;
            font-weight: bold;
        }
        .header .period {
            color: #666;
        }
        .section {
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        .section-header {
            padding: 10px;
            color: white;
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 0;
            border-radius: 5px 5px 0 0;
        }
        .ingresos-header {
            background-color: #10b981;
        }
        .egresos-header {
            background-color: #2563eb;
        }
        .total-box {
            padding: 15px;
            font-size: 20px;
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            text-align: left;
            padding: 8px;
            background-color: #f9fafb;
            color: #6b7280;
            text-transform: uppercase;
            font-size: 8px;
            border-bottom: 1px solid #e5e7eb;
        }
        td {
            padding: 8px;
            border-bottom: 1px solid #f3f4f6;
        }
        .text-right {
            text-align: right;
        }
        .font-bold {
            font-weight: bold;
        }
        .text-emerald {
            color: #059669;
        }
        .text-blue {
            color: #2563eb;
        }
        .text-orange {
            color: #d97706;
        }
        .footer {
            margin-top: 50px;
            text-align: center;
            color: #9ca3af;
            font-size: 8px;
        }
        .totals-summary {
            margin-top: 20px;
            background-color: #f3f4f6;
            padding: 15px;
            border-radius: 10px;
            page-break-inside: avoid;
        }
        .page-break {
            page-break-after: always;
        }
        .detail-section h2 {
            font-size: 14px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
            margin-top: 20px;
            color: #4b5563;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>CONTROL FISCAL PROVISIONAL</h1>
        <div class="client">{{ $clientName }} ({{ $rfc }})</div>
        <div class="period">Periodo: {{ $periodName }} {{ $year }}</div>
    </div>

    <!-- RESUMEN -->
    <div class="section">
        <div class="section-header ingresos-header">
            RESUMEN DE INGRESOS (COBRO REAL)
        </div>
        <div class="total-box text-emerald" style="border: 1px solid #10b981; border-top: none;">
            $ {{ number_format($data['ingresos']['total_efectivo'], 2) }} <span style="font-size: 10px; opacity: 0.7;">MXN</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th width="30%">CONCEPTO (INGRESOS)</th>
                    <th class="text-right">PUE</th>
                    <th class="text-right">PPD</th>
                    <th class="text-right">REP</th>
                    <th class="text-right text-emerald">SUMA EFECTIVO</th>
                    <th class="text-right text-orange">PENDIENTE</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="font-bold">Base Gravable (Subtotal)</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['subtotal']['pue'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['subtotal']['ppd'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['subtotal']['rep'], 2) }}</td>
                    <td class="text-right font-bold text-emerald">$ {{ number_format($data['ingresos']['subtotal']['suma_efectivo'], 2) }}</td>
                    <td class="text-right text-orange">$ {{ number_format($data['ingresos']['subtotal']['pendiente'], 2) }}</td>
                </tr>
                <tr>
                    <td>IVA Facturado</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['iva']['pue'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['iva']['ppd'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['ingresos']['iva']['rep'], 2) }}</td>
                    <td class="text-right text-emerald">$ {{ number_format($data['ingresos']['iva']['suma_efectivo'], 2) }}</td>
                    <td class="text-right text-orange">$ {{ number_format($data['ingresos']['iva']['pendiente'], 2) }}</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                    <td class="font-bold">Total Facturado</td>
                    <td class="text-right font-bold">$ {{ number_format($data['ingresos']['total']['pue'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($data['ingresos']['total']['ppd'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($data['ingresos']['total']['rep'], 2) }}</td>
                    <td class="text-right font-bold text-emerald">$ {{ number_format($data['ingresos']['total']['suma_efectivo'], 2) }}</td>
                    <td class="text-right font-bold text-orange">$ {{ number_format($data['ingresos']['total']['pendiente'], 2) }}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-header egresos-header">
            RESUMEN DE EGRESOS (DEDUCCIONES REALES)
        </div>
        <div class="total-box text-blue" style="border: 1px solid #2563eb; border-top: none;">
            $ {{ number_format($data['egresos']['total_efectivo'], 2) }} <span style="font-size: 10px; opacity: 0.7;">MXN</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th width="30%">CONCEPTO (EGRESOS)</th>
                    <th class="text-right">PUE</th>
                    <th class="text-right">PPD</th>
                    <th class="text-right">REP</th>
                    <th class="text-right text-blue">SUMA DEDUCIBLE</th>
                    <th class="text-right text-orange">PENDIENTE</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="font-bold">Base Deducible (Subtotal)</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['subtotal']['pue'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['subtotal']['ppd'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['subtotal']['rep'], 2) }}</td>
                    <td class="text-right font-bold text-blue">$ {{ number_format($data['egresos']['subtotal']['suma_efectivo'], 2) }}</td>
                    <td class="text-right text-orange">$ {{ number_format($data['egresos']['subtotal']['pendiente'], 2) }}</td>
                </tr>
                <tr>
                    <td>IVA Acreditable</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['iva']['pue'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['iva']['ppd'], 2) }}</td>
                    <td class="text-right">$ {{ number_format($data['egresos']['iva']['rep'], 2) }}</td>
                    <td class="text-right text-blue">$ {{ number_format($data['egresos']['iva']['suma_efectivo'], 2) }}</td>
                    <td class="text-right text-orange">$ {{ number_format($data['egresos']['iva']['pendiente'], 2) }}</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                    <td class="font-bold">Total Facturado</td>
                    <td class="text-right font-bold">$ {{ number_format($data['egresos']['total']['pue'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($data['egresos']['total']['ppd'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($data['egresos']['total']['rep'], 2) }}</td>
                    <td class="text-right font-bold text-blue">$ {{ number_format($data['egresos']['total']['suma_efectivo'], 2) }}</td>
                    <td class="text-right font-bold text-orange">$ {{ number_format($data['egresos']['total']['pendiente'], 2) }}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="totals-summary">
        <table>
            <tr>
                <td><strong>BALANCE OPERATIVO (ESTIMADO):</strong></td>
                <td class="text-right font-bold" style="font-size: 14px;">$ {{ number_format($data['ingresos']['total_efectivo'] - $data['egresos']['total_efectivo'], 2) }}</td>
            </tr>
            <tr>
                <td>IVA TRASLADADO (COBRADO):</td>
                <td class="text-right text-emerald">$ {{ number_format($data['ingresos']['iva']['suma_efectivo'], 2) }}</td>
            </tr>
            <tr>
                <td>IVA ACREDITABLE (PAGADO):</td>
                <td class="text-right text-blue">$ {{ number_format($data['egresos']['iva']['suma_efectivo'], 2) }}</td>
            </tr>
            <tr>
                <td><strong>DIFERENCIA IVA (ESTIMADA):</strong></td>
                <td class="text-right font-bold">$ {{ number_format($data['ingresos']['iva']['suma_efectivo'] - $data['egresos']['iva']['suma_efectivo'], 2) }}</td>
            </tr>
        </table>
    </div>

    <div class="page-break"></div>

    <!-- DETALLE DE FACTURAS -->
    <div class="detail-section">
        <h2 class="text-emerald">RELACIÓN DE INGRESOS (EFECTIVIZADOS)</h2>
        <table>
            <thead>
                <tr>
                    <th width="12%">FECHA</th>
                    <th width="40%">NOMBRE / CLIENTE</th>
                    <th width="8%">METODO</th>
                    <th width="12%">SUBTOTAL</th>
                    <th width="12%">IVA</th>
                    <th width="16%" class="text-right">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                @foreach($details['ingresos'] as $item)
                <tr>
                    <td>{{ $item['fecha'] }}</td>
                    <td>{{ $item['nombre'] }}<br><span style="font-size: 7px; color: #999;">{{ $item['uuid'] }}</span></td>
                    <td>{{ $item['metodo_pago'] }}</td>
                    <td>$ {{ number_format($item['subtotal'], 2) }}</td>
                    <td>$ {{ number_format($item['iva'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($item['total'], 2) }}</td>
                </tr>
                @endforeach
                @if(count($details['ingresos']) == 0)
                <tr>
                    <td colspan="6" style="text-align: center; color: #999; padding: 20px;">No hay registros de ingresos para este periodo.</td>
                </tr>
                @endif
            </tbody>
        </table>

        <div class="page-break"></div>

        <h2 class="text-blue">RELACIÓN DE EGRESOS (DEDUCIBLES)</h2>
        <table>
            <thead>
                <tr>
                    <th width="12%">FECHA</th>
                    <th width="40%">NOMBRE / PROVEEDOR</th>
                    <th width="8%">METODO</th>
                    <th width="12%">SUBTOTAL</th>
                    <th width="12%">IVA</th>
                    <th width="16%" class="text-right">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                @foreach($details['egresos'] as $item)
                <tr>
                    <td>{{ $item['fecha'] }}</td>
                    <td>{{ $item['nombre'] }}<br><span style="font-size: 7px; color: #999;">{{ $item['uuid'] }}</span></td>
                    <td>{{ $item['metodo_pago'] }}</td>
                    <td>$ {{ number_format($item['subtotal'], 2) }}</td>
                    <td>$ {{ number_format($item['iva'], 2) }}</td>
                    <td class="text-right font-bold">$ {{ number_format($item['total'], 2) }}</td>
                </tr>
                @endforeach
                @if(count($details['egresos']) == 0)
                <tr>
                    <td colspan="6" style="text-align: center; color: #999; padding: 20px;">No hay registros de egresos para este periodo.</td>
                </tr>
                @endif
            </tbody>
        </table>
    </div>

    <div class="footer">
        Generado por Fiscalio el {{ date('d/m/Y H:i') }}<br>
        Este reporte es informativo y se basa en los CFDI vigentes en el sistema.
    </div>
</body>
</html>
