<?php
$zipFile = 'storage/app/sat/downloads/GAMC810409FG6/1f8e746a-9756-45fd-8316-99096f2cfdb4/1F8E746A-9756-45FD-8316-99096F2CFDB4_01.zip';
$zip = new ZipArchive;
if ($zip->open($zipFile) === TRUE) {
    echo "Files in ZIP:\n";
    for ($i = 0; $i < $zip->numFiles; $i++) {
        echo $zip->getNameIndex($i) . "\n";
        if ($i > 10) {
            echo "...";
            break;
        }
    }
    $zip->close();
}
else {
    echo "Failed to open ZIP";
}
