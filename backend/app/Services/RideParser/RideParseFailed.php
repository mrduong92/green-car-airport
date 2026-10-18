<?php

namespace App\Services\RideParser;

use RuntimeException;

// Message là mã ngắn (not_configured, daily_limit, http_429, bad_json…) — an toàn để log, không chứa nội dung tin.
class RideParseFailed extends RuntimeException {}
