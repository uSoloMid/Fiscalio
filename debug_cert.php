<?php

use PhpCfdi\Credentials\Certificate;

require __DIR__ . '/sat-api/vendor/autoload.php';

$cerPath = __DIR__ . '/00001000000708261968.cer';
$content = file_get_contents($cerPath);

echo "--- Parsing with openssl_x509_parse ---\n";
// Sometimes openssl_x509_parse needs PEM format
$pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($content), 64, "\n") . "-----END CERTIFICATE-----\n";
$parsed = openssl_x509_parse($pem, true);

if ($parsed) {
    echo "Successfully parsed with OpenSSL.\n";
    echo "Subject: " . print_r($parsed['subject'], true) . "\n";
}
else {
    echo "Failed to parse with OpenSSL.\n";
}

echo "\n--- Parsing with PhpCfdi\Credentials\Certificate ---\n";
try {
    $certificate = new Certificate($content);
    echo "RFC: " . $certificate->rfc() . "\n";
    echo "Legal Name: " . $certificate->legalName() . "\n";
    echo "Subject Data: " . print_r($certificate->subject(), true) . "\n";
}
catch (Exception $e) {
    echo "Failed to parse with PhpCfdi: " . $e->getMessage() . "\n";
}
