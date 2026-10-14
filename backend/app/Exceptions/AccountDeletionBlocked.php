<?php

namespace App\Exceptions;

use RuntimeException;

/** Tài khoản chưa được xoá — message là thông báo tiếng Việt hiện thẳng cho người dùng. */
class AccountDeletionBlocked extends RuntimeException {}
