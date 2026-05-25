import dayjs from 'dayjs'

/** "08:30:00 25-05-2026" từ date field (YYYY-MM-DD) + time field (HH:mm) */
export const fmtDateTime = (date: string, time: string) =>
  dayjs(`${date.slice(0, 10)} ${time.slice(0, 8)}`).format('HH:mm DD-MM-YYYY')
