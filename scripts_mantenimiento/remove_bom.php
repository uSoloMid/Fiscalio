<?php
$path = 'c:\\Fiscalio\\sat-api\\app\\Console\\Commands\\SatRunnerCommand.php';
$content = file_get_contents($path);
if (substr($content, 0, 3) == "\xEF\xBB\xBF") {
    file_put_contents($path, substr($content, 3));
    echo "BOM removed";
}
else {
    echo "No BOM found";
}
