function isIsoDateTime(value: string) {
  return value.includes('T') || value.endsWith('Z');
}

export function formatCompactDate(value: string | null | undefined) {
  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const formatter = new Intl.DateTimeFormat('en-IL', isIsoDateTime(value)
    ? {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }
    : {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

  return formatter.format(parsed);
}
