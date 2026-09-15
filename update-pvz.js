// Пункты выдачи СДЭК для карты в магазине.
// Открытый справочник СДЭК (ключ не нужен, но браузер его напрямую не читает) → компактный pvz-cdek.json рядом с сайтом.
// Формат: { c: [[город, регион, [[код, адрес, широта, долгота, постамат 1/0, часы работы], ...]], ...] }
const fs = require('fs');

(async () => {
  const r = await fetch('https://integration.cdek.ru/pvzlist/v1/json');
  if(!r.ok) throw new Error('СДЭК ответил ' + r.status);
  const all = (await r.json()).pvz || [];
  const cities = new Map();
  for(const p of all){
    if(p.status !== 'ACTIVE' || p.countryCodeIso !== 'RU' || p.isHandout === false) continue;
    const lat = +p.coordY, lon = +p.coordX;
    if(!lat || !lon || !p.address) continue;
    const k = p.city + '|' + (p.regionName || '');
    if(!cities.has(k)) cities.set(k, []);
    cities.get(k).push([p.code, p.address.trim(), +lat.toFixed(5), +lon.toFixed(5), p.type === 'POSTAMAT' ? 1 : 0, (p.workTime || '').trim()]);
  }
  // сбой на стороне СДЭК — старый файл не трогаем
  if(cities.size < 1000) throw new Error('Слишком мало городов: ' + cities.size);
  const c = [...cities].map(([k, pts]) => [...k.split('|'), pts.sort((a, b) => a[1].localeCompare(b[1], 'ru') || a[0].localeCompare(b[0]))])
    .sort((a, b) => a[0].localeCompare(b[0], 'ru') || a[1].localeCompare(b[1], 'ru'));
  fs.writeFileSync('pvz-cdek.json', JSON.stringify({ c }));
  console.log('Городов:', c.length, 'пунктов:', c.reduce((s, x) => s + x[2].length, 0));
})().catch(e => { console.error(e.message); process.exit(1) });
