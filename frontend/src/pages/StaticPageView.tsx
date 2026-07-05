import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { getPublicPage } from '@/api/staticPages'
import { CONTENT_CLASS } from '@/components/admin/TiptapEditor'

export default function StaticPageView() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['static-page', slug],
    queryFn: () => getPublicPage(slug!),
    retry: false,
  })

  return (
    <div className="min-h-svh bg-white flex flex-col w-full">
      <div className="px-4 pt-14 pb-2 safe-top flex items-center">
        <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center text-navy">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex-1 px-6 pt-2 pb-10">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <span className="material-symbols-outlined text-4xl text-neutral-gray">search_off</span>
            <p className="text-neutral-gray text-sm">Không tìm thấy trang</p>
          </div>
        )}

        {data && (
          <>
            <h1 className="text-navy font-bold text-[22px] mb-4">{data.title}</h1>
            <div
              className={clsx('text-sm text-navy leading-relaxed', CONTENT_CLASS)}
              dangerouslySetInnerHTML={{ __html: data.content }}
            />
          </>
        )}
      </div>
    </div>
  )
}
