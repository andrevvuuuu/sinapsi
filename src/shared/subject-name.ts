export function displaySubject(name: string, known: string[] = []): string {
  const key = (value: string): string => value.toLocaleLowerCase().replace(/[\s_-]+/g, '')
  const match = known.find((value) => key(value) === key(name))
  if (match) return match
  return name
    .replace(/([a-zà-öø-ÿ0-9])([A-ZÀ-ÖØ-Þ])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ')
}
