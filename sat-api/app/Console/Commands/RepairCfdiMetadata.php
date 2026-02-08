<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class RepairCfdiMetadata extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:repair-metadata';

    protected $description = 'Extrae serie, folio y metodo de pago de los XMLs existentes';

    public function __construct()
    {
        parent::__construct();
    }

    public function handle(\App\Services\XmlProcessorService $processor)
    {
        $cfdis = \App\Models\Cfdi::whereNull('metodo_pago')
            ->orWhereNull('serie')
            ->orWhereNull('folio')
            ->orWhere('subtotal', 0)
            ->orWhereNull('domicilio_fiscal_receptor')
            ->get();

        $this->info("Reparando " . $cfdis->count() . " facturas...");

        $bar = $this->output->createProgressBar($cfdis->count());
        $bar->start();

        foreach ($cfdis as $cfdi) {
            if (!\Illuminate\Support\Facades\Storage::exists($cfdi->path_xml)) {
                $bar->advance();
                continue;
            }

            $xmlContent = \Illuminate\Support\Facades\Storage::get($cfdi->path_xml);
            $data = $processor->parseCfdi($xmlContent);

            if ($data) {
                $cfdi->update([
                    'serie' => $data['serie'],
                    'folio' => $data['folio'],
                    'regimen_fiscal_emisor' => $data['regimen_fiscal_emisor'],
                    'regimen_fiscal_receptor' => $data['regimen_fiscal_receptor'],
                    'domicilio_fiscal_receptor' => $data['domicilio_fiscal_receptor'],
                    'exportacion' => $data['exportacion'],
                    'subtotal' => $data['subtotal'],
                    'descuento' => $data['descuento'],
                    'moneda' => $data['moneda'],
                    'tipo_cambio' => $data['tipo_cambio'],
                    'forma_pago' => $data['forma_pago'],
                    'metodo_pago' => $data['metodo_pago'],
                    'uso_cfdi' => $data['uso_cfdi']
                ]);
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("Reparación completada.");

        return 0;
    }
}
