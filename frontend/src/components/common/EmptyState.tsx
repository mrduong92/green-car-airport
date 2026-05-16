interface Props {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon = 'directions_car', title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="material-symbols-outlined text-6xl text-border-gray mb-4">{icon}</span>
      <p className="text-h2 text-navy font-semibold mb-2">{title}</p>
      {description && <p className="text-body text-neutral-gray mb-6">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="bg-primary text-white rounded-pill px-6 py-3 text-cta font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
