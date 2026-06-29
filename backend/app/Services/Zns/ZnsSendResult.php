<?php

namespace App\Services\Zns;

readonly class ZnsSendResult
{
    public function __construct(
        public bool $success,
        public ?string $clientReqId = null,
        public ?string $trackingId = null,
        public ?string $error = null,
    ) {}
}
