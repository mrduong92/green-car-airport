<?php

namespace Tests\Unit\Support;

use App\Support\PhoneNumber;
use Tests\TestCase;

class PhoneNumberTest extends TestCase
{
    public function test_already_normalized_number_is_unchanged(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('0868968312'));
    }

    public function test_missing_leading_zero_gets_prefixed(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('868968312'));
    }

    public function test_84_country_code_without_plus_is_converted(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('84868968312'));
    }

    public function test_plus_84_country_code_with_spaces_is_converted(): void
    {
        $this->assertSame('0868968312', PhoneNumber::normalize('+84 86 896 8312'));
    }

    public function test_number_starting_with_08_is_not_mistaken_for_country_code(): void
    {
        $this->assertSame('0846123456', PhoneNumber::normalize('0846123456'));
    }

    public function test_nine_digit_number_starting_with_84_gets_leading_zero_prefixed(): void
    {
        // 9 digits total, not the 11-digit country-code pattern -> just prefix with 0.
        $this->assertSame('0846123456', PhoneNumber::normalize('846123456'));
    }

    public function test_null_input_returns_empty_string(): void
    {
        $this->assertSame('', PhoneNumber::normalize(null));
    }
}
