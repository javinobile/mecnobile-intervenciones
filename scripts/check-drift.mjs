import { PrismaClient } from '../generated/prisma/index.js';

const p = new PrismaClient();

const dups = await p.$queryRawUnsafe(`
  select count(*)::int as grupos
  from (
    select "firstName", "lastName", "phone"
    from "Client"
    group by 1,2,3
    having count(*) > 1
  ) t
`);
console.log('Grupos duplicados (firstName,lastName,phone) en Client:', dups[0].grupos);

const idx = await p.$queryRawUnsafe(`
  select indexname, indexdef from pg_indexes
  where schemaname='public' and tablename in ('Client','Car')
  order by tablename, indexname
`);
console.log('=== índices Client/Car ===');
for (const i of idx) console.log('-', i.indexdef);

const defs = await p.$queryRawUnsafe(`
  select table_name, column_name, column_default
  from information_schema.columns
  where table_schema='public' and column_name='id' and column_default is not null
  order by table_name
`);
console.log('=== columnas id con default en DB ===');
for (const d of defs) console.log('-', d.table_name, '->', d.column_default);

await p.$disconnect();
