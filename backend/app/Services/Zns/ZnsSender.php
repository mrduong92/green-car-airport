<?php

namespace App\Services\Zns;

interface ZnsSender
{
    public function send(string $phone, string $code): ZnsSendResult;
    public function getBalance(): ?int;
}
