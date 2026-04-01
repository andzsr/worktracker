export const PEOPLE = [
  { id: null, name: '', role: '', initials: '?', avClass: 'av-a', color: '#888' },
]

export const PERSON_META = {
  // filled dynamically from DB, but keep fallback colors
  colors: ['#1D9E75','#378ADD','#BA7517','#D85A30','#D4537E','#7F77DD','#639922'],
  avClasses: ['av-a','av-b','av-c','av-d','av-e','av-a','av-b'],
}

export function fmt(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export function badgeClass(status) {
  if (status === 'Selesai') return 'badge-done'
  if (status === 'Berlangsung') return 'badge-prog'
  return 'badge-pend'
}

export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
}

export function avClass(index) {
  const classes = ['av-a','av-b','av-c','av-d','av-e']
  return classes[index % classes.length]
}

export function personColor(index) {
  const colors = ['#1D9E75','#378ADD','#BA7517','#D85A30','#D4537E','#7F77DD','#639922']
  return colors[index % colors.length]
}
