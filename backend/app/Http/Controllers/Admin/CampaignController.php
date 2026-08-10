<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Support\CampaignTrigger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CampaignController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Campaign::latest()->get()->map(fn ($c) => $this->formatCampaign($c)));
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name'                        => 'required|string|max:100',
            'trigger'                     => ['required', 'string', Rule::in(CampaignTrigger::ALL)],
            'reward.voucher_count'        => 'required|integer|min:1|max:20',
            'reward.voucher_value'        => 'required|integer|min:1000',
            'reward.voucher_expires_days' => 'required|integer|min:1|max:365',
            'starts_at'                   => 'nullable|date',
            'ends_at'                     => 'nullable|date|after:starts_at',
            'max_grants'                  => 'nullable|integer|min:1',
        ]);

        $campaign = Campaign::create([
            'name'         => $request->name,
            'trigger'      => $request->trigger,
            'reward'       => $request->input('reward'),
            'starts_at'    => $request->starts_at,
            'ends_at'      => $request->ends_at,
            'max_grants'   => $request->max_grants,
            'grants_count' => 0,
            'is_active'    => true,
        ]);

        return response()->json($this->formatCampaign($campaign), 201);
    }

    public function update(Request $request, Campaign $campaign): JsonResponse
    {
        $request->validate([
            'is_active'                   => 'sometimes|boolean',
            'starts_at'                   => 'sometimes|nullable|date',
            'ends_at'                     => 'sometimes|nullable|date|after:starts_at',
            'max_grants'                  => 'sometimes|nullable|integer|min:1',
            'reward.voucher_count'        => 'sometimes|required|integer|min:1|max:20',
            'reward.voucher_value'        => 'sometimes|required|integer|min:1000',
            'reward.voucher_expires_days' => 'sometimes|required|integer|min:1|max:365',
        ]);

        $data = $request->only(['is_active', 'starts_at', 'ends_at', 'max_grants']);
        if ($request->has('reward')) {
            $data['reward'] = $request->input('reward');
        }

        $campaign->update($data);

        return response()->json($this->formatCampaign($campaign->fresh()));
    }

    private function formatCampaign(Campaign $c): array
    {
        return [
            'id'           => $c->id,
            'name'         => $c->name,
            'trigger'      => $c->trigger,
            'reward'       => $c->reward,
            'starts_at'    => $c->starts_at,
            'ends_at'      => $c->ends_at,
            'max_grants'   => $c->max_grants,
            'grants_count' => $c->grants_count,
            'is_active'    => (bool) $c->is_active,
        ];
    }
}
