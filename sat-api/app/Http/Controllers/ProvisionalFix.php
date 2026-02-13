<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
class ProvisionalFix extends Controller
{
    public function getBucketDetails(Request $request)
    {
        $bucket = $request->query('bucket');
        return response()->json([['id' => 1, 'bucket' => $bucket, 'msg' => 'Test Fix']]);
    }
}
