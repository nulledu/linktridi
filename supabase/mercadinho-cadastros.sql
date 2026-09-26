-- TridiMarket — cadastro completo pelo painel
--
-- Duas colunas que faltavam pra fechar o cadastro. Idempotente: pode rodar
-- quantas vezes quiser. O código tolera a ausência das duas (o painel só
-- deixa de mostrar o vínculo e o logo), então não há ordem obrigatória entre
-- rodar isto e subir o deploy.

-- 1) Vínculo da pessoa do mercadinho com o usuário do Gaius.
--
-- É o que faz "Marina do mercadinho" e "Marina que loga no sistema" serem a
-- mesma pessoa: com o vínculo, ela vê a própria dívida quando entra no Gaius,
-- e o RH não precisa conferir dois cadastros na mão.
--
-- ON DELETE SET NULL de propósito: apagar o acesso de alguém ao Gaius não pode
-- apagar (nem órfanizar) o histórico de compras dela no mercadinho.
alter table mercadinho.funcionarios
  add column if not exists usuario_id uuid references public.profiles(id) on delete set null;

-- Uma pessoa do Gaius não pode estar em dois cadastros do mercadinho — senão
-- "minha dívida" fica ambíguo. Parcial porque a maioria fica sem vínculo.
create unique index if not exists funcionarios_usuario_unico
  on mercadinho.funcionarios(usuario_id) where usuario_id is not null;

-- 2) Logo da unidade (empresa). Fica no bucket público `branding`, que o
-- sistema já usa pra marca — sem bucket novo pra criar ou liberar.
alter table mercadinho.unidades
  add column if not exists logo_url text;

notify pgrst, 'reload schema';
