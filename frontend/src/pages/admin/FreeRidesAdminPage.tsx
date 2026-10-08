import { useSearchParams } from 'react-router-dom'
import GroupsTab from '@/components/admin/freeRides/GroupsTab'
import SendersTab from '@/components/admin/freeRides/SendersTab'
import StatusTab from '@/components/admin/freeRides/StatusTab'
import clsx from 'clsx'

type TabKey = 'groups' | 'senders' | 'status'

const TABS: { key: TabKey; label: string; testId: string }[] = [
  { key: 'groups', label: 'Nhóm Zalo', testId: 'admin-free-tab-groups' },
  { key: 'senders', label: 'Người bắn', testId: 'admin-free-tab-senders' },
  { key: 'status', label: 'Tình trạng', testId: 'admin-free-tab-status' },
]

export default function FreeRidesAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab: TabKey = rawTab === 'senders' || rawTab === 'status' ? rawTab : 'groups'

  const setTab = (next: TabKey) => setSearchParams((prev) => {
    const params = new URLSearchParams(prev)
    params.set('tab', next)
    return params
  }, { replace: true })

  return (
    <div className="flex flex-col gap-0">
      <div className="bg-white px-4 pt-4 pb-3 border-b border-border-gray">
        <h1 className="text-[18px] font-bold text-navy mb-3">Cuốc Free</h1>
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              data-testid={t.testId}
              onClick={() => setTab(t.key)}
              className={clsx(
                'rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap',
                tab === t.key ? 'bg-primary text-white' : 'bg-light-green text-primary',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'groups' && <GroupsTab />}
      {tab === 'senders' && <SendersTab />}
      {tab === 'status' && <StatusTab />}
    </div>
  )
}
