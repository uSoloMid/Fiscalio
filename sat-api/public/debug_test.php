<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

define('LARAVEL_START', microtime(true));

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';

$kernel = $app->make(Kernel::class);
$response = $kernel->handle(
    $request = Request::capture()
);

// We are now bootstrapped. 

$rfc = $_GET['rfc'] ?? 'GAMC810409FG6'; // Default from screenshot? Or guess? 
// Actually I don't know the RFC. I'll ask user to provide it or maybe just list all.
// But the screenshot had "MARIA DEL CARMEN...".
// I will just print a form if no RFC.

if (!isset($_GET['rfc'])) {
    echo '<form>
        RFC: <input name="rfc" value="GAMC810409FG6"><br>
        Year: <input name="year" value="2026"><br>
        Month: <input name="month" value="1"><br>
        <button type="submit">Debug</button>
    </form>';
    exit;
}

$rfc = $_GET['rfc'];
$year = (int)$_GET['year'];
$month = (int)$_GET['month'];

echo "<h1>Debug for $rfc - $year / $month</h1>";

$strMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
$startDate = "{$year}-{$strMonth}-01 00:00:00";
$carbonEnd = Carbon::createFromDate($year, $month, 1)->endOfMonth();
$endDate = $carbonEnd->format('Y-m-d 23:59:59');

echo "Range: $startDate to $endDate <br><br>";

// 1. Check SQL SUM
$sqlSum = DB::table('cfdis')
    ->where('rfc_receptor', $rfc) // Egresos
    ->where('tipo', 'I')
    ->where('metodo_pago', 'PPD')
    ->where('es_cancelado', false)
    ->whereBetween('fecha', [$startDate, $endDate])
    ->select(
    DB::raw('count(*) as count'),
    DB::raw('SUM(subtotal) as raw_subtotal'),
    DB::raw('SUM(total) as raw_total')
)->first();

echo "<h3>SQL SUM (Egresos PPD)</h3>";
echo "<pre>" . json_encode($sqlSum, JSON_PRETTY_PRINT) . "</pre>";

// 2. Check PHP Iteration
$invoices = DB::table('cfdis')
    ->where('rfc_receptor', $rfc)
    ->where('tipo', 'I')
    ->where('metodo_pago', 'PPD')
    ->where('es_cancelado', false)
    ->whereBetween('fecha', [$startDate, $endDate])
    ->get();

echo "<h3>PHP Iteration (Egresos PPD)</h3>";
echo "<table border='1'><tr><th>UUID</th><th>Fecha</th><th>Subtotal</th><th>Total</th><th>Pagado (Calc)</th><th>Saldo</th></tr>";

$phpSumSub = 0;
$phpPendSub = 0;

foreach ($invoices as $c) {
    if (!$c->subtotal)
        $c->subtotal = 0;
    if (!$c->total)
        $c->total = 0;

    $pagado = DB::table('cfdi_payments')
        ->where('uuid_relacionado', $c->uuid)
        ->where('fecha_pago', '<=', $endDate)
        ->sum('monto_pagado');

    $saldo = max(0, $c->total - $pagado);
    $phpSumSub += $c->subtotal;

    // Add to pending if valid
    if ($saldo > 0.05) {
        $ratio = ($c->total > 0) ? ($saldo / $c->total) : 0;
        $phpPendSub += ($c->subtotal * $ratio);

        echo "<tr>
            <td>{$c->uuid}</td>
            <td>{$c->fecha}</td>
            <td>{$c->subtotal}</td>
            <td>{$c->total}</td>
            <td>{$pagado}</td>
            <td>{$saldo}</td>
        </tr>";
    }
}
echo "</table>";

echo "<h3>Summary</h3>";
echo "SQL Count: " . $sqlSum->count . "<br>";
echo "PHP Count (Total PPD): " . $invoices->count() . "<br>";
echo "SQL Sum Subtotal: " . number_format($sqlSum->raw_subtotal, 2) . "<br>";
echo "PHP Sum Subtotal: " . number_format($phpSumSub, 2) . "<br>";
echo "PHP Calculated Pending Subtotal: " . number_format($phpPendSub, 2) . "<br>";
