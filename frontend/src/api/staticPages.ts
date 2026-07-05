// frontend/src/api/staticPages.ts
import api from './axios'

export const getPublicPage = (slug: string) =>
  api.get<{ slug: string; title: string; content: string }>(`/pages/${slug}`).then((r) => r.data)

// Admin CRUD
export const listPages = () =>
  api.get<App.StaticPage[]>('/admin/pages').then((r) => r.data)

export const createPage = (data: { slug: string; title: string; content: string }) =>
  api.post<App.StaticPage>('/admin/pages', data)

export const updatePage = (id: number, data: Partial<Pick<App.StaticPage, 'title' | 'content' | 'is_active'>>) =>
  api.put<App.StaticPage>(`/admin/pages/${id}`, data)

export const deletePage = (id: number) =>
  api.delete(`/admin/pages/${id}`)
