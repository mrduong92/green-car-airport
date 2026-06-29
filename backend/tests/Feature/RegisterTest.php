<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_saves_name_when_provided(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0901111111',
            'otp'      => '000000',
            'password' => '123456',
            'name'     => 'Nguyễn Văn A',
        ])
            ->assertOk()
            ->assertJsonPath('user.name', 'Nguyễn Văn A');

        $this->assertDatabaseHas('users', [
            'phone' => '0901111111',
            'name'  => 'Nguyễn Văn A',
        ]);
    }

    public function test_register_succeeds_without_name(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0902222222',
            'otp'      => '000000',
            'password' => '123456',
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_register_rejects_name_longer_than_100_chars(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '0903333333',
            'otp'      => '000000',
            'password' => '123456',
            'name'     => str_repeat('A', 101),
        ])
            ->assertStatus(422);
    }

    public function test_register_rejects_duplicate_phone(): void
    {
        // Đăng ký lần 1
        $this->postJson('/api/auth/register', [
            'phone'    => '0904444444',
            'otp'      => '000000',
            'password' => '123456',
        ])->assertOk();

        // Đăng ký lần 2 với cùng SĐT
        $this->postJson('/api/auth/register', [
            'phone'    => '0904444444',
            'otp'      => '000000',
            'password' => '123456',
        ])->assertStatus(422)
          ->assertJsonPath('message', 'Số điện thoại đã được đăng ký.');
    }
}
