<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Khoảng ngày lọc + gom nhóm ngày/tuần/tháng cho các báo cáo (admin Giới thiệu, khách Thống kê).
 *
 * Ranh giới tính theo múi giờ app (config('app.timezone')). Tuần bắt đầu thứ Hai; nhãn tuần/tháng
 * ở hai đầu khoảng bị cắt theo from/to. Việc gom theo NGÀY làm ở SQL (groupByRaw('DATE(...)') —
 * portable MySQL + sqlite), còn dồn ngày thành tuần/tháng làm ở PHP qua fold().
 */
class DateBuckets
{
    public const MAX_RANGE_DAYS = 366;

    public readonly Carbon $from;

    public readonly Carbon $to;

    public function __construct(Carbon $from, Carbon $to, public readonly string $group = 'day')
    {
        $this->from = $from->copy()->startOfDay();
        $this->to = $to->copy()->startOfDay();
    }

    /**
     * Đọc + kiểm tra from/to/group từ request. Thiếu to → hôm nay; thiếu from → lùi theo preset
     * mặc định ('30d' = 30 ngày gần nhất, 'month' = từ ngày 1 của tháng của `to`).
     *
     * @throws ValidationException
     */
    public static function fromRequest(Request $request, string $defaultPreset = '30d'): self
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'group' => ['nullable', 'in:day,week,month'],
        ]);

        $tz = config('app.timezone');

        // '!' reset modifier: tránh giờ/phút/giây rác lẫn vào mốc được parse từ chuỗi Y-m-d.
        $to = isset($data['to']) ? Carbon::createFromFormat('!Y-m-d', $data['to'], $tz) : Carbon::today($tz);
        $from = isset($data['from'])
            ? Carbon::createFromFormat('!Y-m-d', $data['from'], $tz)
            : ($defaultPreset === 'month' ? $to->copy()->startOfMonth() : $to->copy()->subDays(29));

        return self::make($from, $to, $data['group'] ?? 'day');
    }

    /** @throws ValidationException */
    public static function make(Carbon $from, Carbon $to, string $group = 'day'): self
    {
        if ($to->lt($from)) {
            throw ValidationException::withMessages(['to' => ['"Đến ngày" phải sau hoặc bằng "Từ ngày".']]);
        }
        // +1 vì khoảng bao gồm cả from lẫn to (vd from=to → 1 ngày).
        if ($from->diffInDays($to) + 1 > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => ['Khoảng thời gian tối đa là 366 ngày.']]);
        }

        return new self($from, $to, $group);
    }

    public function fromStart(): Carbon
    {
        return $this->from->copy()->startOfDay();
    }

    public function toEnd(): Carbon
    {
        return $this->to->copy()->endOfDay();
    }

    public function bucketKeyForDate(string $ymd): string
    {
        $date = Carbon::createFromFormat('!Y-m-d', $ymd);

        return match ($this->group) {
            'week' => $date->startOfWeek(Carbon::MONDAY)->format('Y-m-d'),
            'month' => $date->format('Y-m'),
            default => $ymd,
        };
    }

    /**
     * Các mốc theo thứ tự, kể cả mốc trống.
     *
     * @return list<array{key: string, label: string, start: Carbon, end: Carbon}>
     */
    public function buckets(): array
    {
        $buckets = [];
        $cursor = $this->from->copy();

        while ($cursor->lte($this->to)) {
            $key = $this->bucketKeyForDate($cursor->format('Y-m-d'));

            if (! isset($buckets[$key])) {
                $buckets[$key] = ['start' => $cursor->copy(), 'end' => $cursor->copy()];
            }
            $buckets[$key]['end'] = $cursor->copy();

            $cursor->addDay();
        }

        $out = [];
        foreach ($buckets as $key => $b) {
            $out[] = [
                'key' => (string) $key,
                'label' => match ($this->group) {
                    'week' => $b['start']->format('d/m').'–'.$b['end']->format('d/m'),
                    'month' => $b['start']->format('m/Y'),
                    default => $b['start']->format('d/m'),
                },
                'start' => $b['start'],
                'end' => $b['end'],
            ];
        }

        return $out;
    }

    /**
     * Dồn số liệu theo ngày vào các mốc, điền 0 cho mốc trống.
     *
     * @param  array<string, array<string, int|float|string|null>>  $perDay  Y-m-d => [metric => value]
     * @param  list<string>  $metrics  tên các chỉ số cần cộng
     * @return list<array<string, mixed>> mỗi dòng: key, label + từng metric
     */
    public function fold(array $perDay, array $metrics): array
    {
        $rows = [];
        foreach ($this->buckets() as $b) {
            $rows[$b['key']] = ['key' => $b['key'], 'label' => $b['label']] + array_fill_keys($metrics, 0);
        }

        foreach ($perDay as $ymd => $values) {
            $key = $this->bucketKeyForDate((string) $ymd);
            if (! isset($rows[$key])) {
                continue; // ngoài khoảng lọc
            }
            foreach ($metrics as $m) {
                $rows[$key][$m] += (int) ($values[$m] ?? 0);
            }
        }

        return array_values($rows);
    }
}
