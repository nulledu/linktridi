-- Dados mock iniciais (espelham web/lib/datasource/mock-data.ts).

insert into salespeople (id,name,photo_url,team,daily_sales,weekly_sales,monthly_sales,daily_goal,weekly_goal,monthly_goal) values
  ('s1','Ana Souza',null,'comercial',4200,21000,86000,4000,20000,80000),
  ('s2','Bia Lima',null,'marketing',3800,19500,72000,4000,20000,80000),
  ('s3','Carla Reis',null,'comercial',5100,24000,95000,4500,22000,90000),
  ('s4','Duda Alves',null,'marketing',2900,15000,61000,3500,18000,70000),
  ('s5','Elis Nunes',null,'comercial',3300,17000,68000,3500,18000,72000)
on conflict (id) do update set
  daily_sales=excluded.daily_sales, weekly_sales=excluded.weekly_sales, monthly_sales=excluded.monthly_sales,
  daily_goal=excluded.daily_goal, weekly_goal=excluded.weekly_goal, monthly_goal=excluded.monthly_goal;

insert into teams (id,name,current,goal) values
  ('marketing','Marketing',133000,150000),
  ('comercial','Comercial',249000,242000)
on conflict (id) do update set current=excluded.current, goal=excluded.goal;

insert into products (id,name,image_url,qty,revenue) values
  ('p1','Plano Pro Anual',null,142,142000),
  ('p2','Plano Start',null,318,95400),
  ('p3','Add-on Suporte',null,87,43500),
  ('p4','Consultoria',null,24,60000),
  ('p5','Treinamento',null,41,41000)
on conflict (id) do update set qty=excluded.qty, revenue=excluded.revenue;

insert into revenue (id,daily,weekly,monthly,trend_pct) values (1,19300,96500,382000,12.4)
on conflict (id) do update set daily=excluded.daily, weekly=excluded.weekly, monthly=excluded.monthly, trend_pct=excluded.trend_pct;

insert into config (id,data) values (1, '{
  "theme": {"primary":"#0A84FF","secondary":"#30D158","background":"#000000","logoUrl":null},
  "slideIntervalMs": 20000,
  "refreshIntervalMs": 30000,
  "goalSoundUrl": null
}'::jsonb)
on conflict (id) do nothing;
