<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    <style>
        body { font-family: 'Helvetica', sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 20px; }
        .header { border-bottom: 2px solid #0056b3; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { margin: 0; color: #0056b3; font-size: 18pt; }
        .header p { margin: 5px 0 0; color: #666; }
        .summary { margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #0056b3; color: white; padding: 8px; text-align: left; font-size: 9pt; }
        td { border-bottom: 1px solid #eee; padding: 8px; font-size: 9pt; vertical-align: top; }
        .text-right { text-align: right; }
        .footer { position: fixed; bottom: 10px; width: 100%; text-align: center; color: #aaa; font-size: 8pt; }
        .non-deductible { color: #d9534f; font-style: italic; }
        .total-row { background: #f0f4f8; font-weight: bold; }
        .tag { display: inline-block; padding: 2px 5px; border-radius: 3px; font-size: 8pt; background: #eee; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ $title }}</h1>
        <p><strong>Cliente:</strong> {{ $clientName }} ({{ $rfc }})</p>
        <p><strong>Periodo:</strong> {{ $period }}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th width="15%">Fecha</th>
                <th width="45%">Concepto / Emisor</th>
                <th width="10%">Método / Uso</th>
                <th width="10%" class="text-right">Subtotal</th>
                <th width="10%" class="text-right">IVA</th>
                <th width="10%" class="text-right">Total</th>
            </tr>
        </thead>
        <tbody>
            @php
                $subTotal = 0;
                $ivaTotal = 0;
                $totalSum = 0;
            @endphp
            @foreach($items as $item)
                @php
                    if($item['is_deductible']) {
                        $subTotal += $item['subtotal'];
                        $ivaTotal += $item['iva'];
                        $totalSum += $item['total'];
                    }
                @endphp
                <tr class="{{ !$item['is_deductible'] ? 'non-deductible' : '' }}">
                    <td>{{ $item['fecha'] }}</td>
                    <td>
                        <strong>{{ $item['nombre'] }}</strong><br>
                        <span style="font-size: 7pt; color: #888;">{{ $item['uuid'] }}</span>
                        @if(!$item['is_deductible'])
                            <br><span class="tag">NO DEDUCIBLE {{ $item['deduction_type'] ? '(' . $item['deduction_type'] . ')' : '' }}</span>
                        @endif
                    </td>
                    <td>
                        {{ $item['metodo_pago'] ?? '---' }}<br>
                        {{ $item['uso_cfdi'] ?? '---' }}
                    </td>
                    <td class="text-right">${{ number_format($item['subtotal'], 2) }}</td>
                    <td class="text-right">${{ number_format($item['iva'], 2) }}</td>
                    <td class="text-right">${{ number_format($item['total'], 2) }}</td>
                </tr>
            @endforeach
        </tbody>
        <tfoot>
            <tr class="total-row">
                <td colspan="3" class="text-right">TOTAL DEDUCIBLE ({{ count(array_filter($items, fn($i) => $i['is_deductible'])) }}):</td>
                <td class="text-right">${{ number_format($subTotal, 2) }}</td>
                <td class="text-right">${{ number_format($ivaTotal, 2) }}</td>
                <td class="text-right">${{ number_format($totalSum, 2) }}</td>
            </tr>
            @php
                $ndCount = count(array_filter($items, fn($i) => !$i['is_deductible']));
                $ndSub = array_sum(array_map(fn($i) => $i['is_deductible'] ? 0 : $i['subtotal'], $items));
                $ndIva = array_sum(array_map(fn($i) => $i['is_deductible'] ? 0 : $i['iva'], $items));
                $ndTot = array_sum(array_map(fn($i) => $i['is_deductible'] ? 0 : $item['total'], $items)); // Wait, $item there is a bug if I use loop variable outer
            @endphp
            @if($ndCount > 0)
                <tr class="non-deductible">
                    <td colspan="3" class="text-right">TOTAL NO DEDUCIBLE ({{ $ndCount }}):</td>
                    <td class="text-right">${{ number_format($ndSub, 2) }}</td>
                    <td class="text-right">${{ number_format($ndIva, 2) }}</td>
                    <td class="text-right">${{ number_format(array_sum(array_map(fn($i) => $i['is_deductible'] ? 0 : $i['total'], $items)), 2) }}</td>
                </tr>
            @endif
        </tfoot>
    </table>

    <div class="footer">
        Generado por Fiscalio el {{ date('d/m/Y H:i') }}
    </div>
</body>
</html>
