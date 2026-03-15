<?php

namespace App\Services;

use App\Models\Poliza;
use Illuminate\Support\Collection;

/**
 * Genera el archivo TXT de ancho fijo compatible con CONTPAQi Contabilidad v18.x
 *
 * Formato (separador: espacio simple, codificación: Windows-1252):
 *   P  {fecha}  {tipo}  {folio}  {clase}  {diario}  {concepto(100)}  {sisOrig}  {impresa}  {ajuste}
 *   M  {cuenta(30)}  {referencia(10)}  {tipoMovto}  {importe(20)}  {diario}  {importeME(20)}  {concepto(100)}
 *   AD {uuid}
 */
class PolizaExportService
{
    /**
     * @param  Collection<Poliza>  $polizas  (con lines.account cargados)
     * @return string  Contenido del archivo TXT
     */
    public function generate(Collection $polizas): string
    {
        $lines = [];

        foreach ($polizas as $poliza) {
            $lines[] = $this->buildPRow($poliza);

            // Primera línea tiene el UUID para la fila AD (asociación documento)
            $uuidAdded = false;

            foreach ($poliza->lines as $line) {
                $lines[] = $this->buildMRow($line, $poliza->numero);

                // Agregar AD row con UUID una sola vez por póliza (después del primer M)
                if (!$uuidAdded && $line->uuid_cfdi) {
                    $lines[] = $this->buildADRow($line->uuid_cfdi);
                    $uuidAdded = true;
                }
            }
        }

        // Codificar en Windows-1252 (ANSI) que es lo que espera CONTPAQi
        $content = implode("\r\n", $lines) . "\r\n";

        return mb_convert_encoding($content, 'Windows-1252', 'UTF-8');
    }

    // ── Fila P (encabezado de póliza) ─────────────────────────────────────────
    private function buildPRow(Poliza $poliza): string
    {
        $fecha     = $poliza->fecha->format('Ymd');     // yyyyMMdd
        $tipo      = $this->pad((string)$poliza->tipo_poliza, 4, STR_PAD_RIGHT);
        $folio     = $this->pad((string)$poliza->numero, 9, STR_PAD_LEFT);
        $clase     = '1';
        $diario    = $this->pad('0', 10, STR_PAD_LEFT);
        $concepto  = $this->pad($this->clean($poliza->concepto), 100, STR_PAD_RIGHT);
        $sisOrig   = '11';
        $impresa   = '0';
        $ajuste    = '0';

        return "P {$fecha} {$tipo} {$folio} {$clase} {$diario} {$concepto} {$sisOrig} {$impresa} {$ajuste}";
    }

    // ── Fila M (movimiento de póliza) ─────────────────────────────────────────
    private function buildMRow(\App\Models\PolizaLine $line, int $polizaNumero): string
    {
        // El código de cuenta sin guiones (ContPAQi espera el código interno)
        $cuenta     = $this->pad($line->account->internal_code ?? $line->account->sat_code, 30, STR_PAD_RIGHT);
        $referencia = $this->pad((string)$polizaNumero, 10, STR_PAD_LEFT);
        $tipoMovto  = (string)$line->tipo_movto;   // 0=Cargo 1=Abono
        $importe    = $this->pad(number_format($line->importe, 2, '.', ''), 20, STR_PAD_RIGHT);
        $diario     = $this->pad('0', 10, STR_PAD_LEFT);
        $importeME  = $this->pad('0.00', 20, STR_PAD_RIGHT);
        $concepto   = $this->pad($this->clean($line->concepto ?? ''), 100, STR_PAD_RIGHT);

        return "M {$cuenta} {$referencia} {$tipoMovto} {$importe} {$diario} {$importeME} {$concepto}";
    }

    // ── Fila AD (asociación UUID de CFDI) ─────────────────────────────────────
    private function buildADRow(string $uuid): string
    {
        return "AD {$uuid}";
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function pad(string $value, int $length, int $direction): string
    {
        // Truncar si excede
        $value = substr($value, 0, $length);
        return str_pad($value, $length, ' ', $direction);
    }

    /** Limpia caracteres que no acepta Windows-1252 */
    private function clean(string $value): string
    {
        return str_replace(["\n", "\r", "\t"], ' ', $value);
    }
}
