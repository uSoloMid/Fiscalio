<?php

namespace App\Services;

class PolizaMissingAccountException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?string $rfc,
        public readonly ?string $nombre,
        public readonly string $type = 'rfc',   // 'rfc' | 'banco'
        public readonly ?string $bankName = null,
        public readonly ?string $accountNumber = null,
    ) {
        parent::__construct($message);
    }
}
