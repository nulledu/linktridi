-- Trava do endereço do site de tutoriais (17/09/2026).
--
-- A Central de Tutoriais mora em https://www.carimbostridii.com.br/p/<slug> e
-- o link circula FORA do app: QR impresso em caixa e etiqueta, link em ficha de
-- produto, no WhatsApp do atendimento. Trocar o domínio não é "mudar uma
-- configuração" — é apagar tudo que já foi impresso, porque host com dono só
-- serve o que foi marcado pra ele (`publicacaoDoHost` em lib/tridiflow-db.ts) e
-- o QR antigo passa a cair em "página indisponível".
--
-- A tela já não oferece a troca, mas tela não é trava: a API genérica dos
-- projetos (`PATCH /api/tridiflow/bots`) grava `dominio_id` de qualquer linha, e
-- SQL na mão grava de qualquer jeito. A trava é aqui, no dado.
--
-- Regra: numa linha que é central de tutoriais, `dominio_id` só pode ser o id
-- de `www.carimbostridii.com.br`. Voltar PRA casa é sempre permitido (é assim
-- que a central nasce no lugar certo, já que ela é inserida antes de ganhar
-- domínio); sair de casa, nunca.
--
-- O corpo da função vai COMPACTO e sem comentário dentro do $$: editor de SQL
-- que parte o script em statements por conta própria cortava o corpo no meio
-- ("syntax error at or near if"). A explicação de cada teste, na ordem:
--   1. UPDATE que menciona a coluna sem mudar o valor passa reto — é o caso do
--      auto-save, que manda a linha inteira.
--   2. Só central é travada, e olhando as DUAS versões da linha: assim nem
--      tirar o template junto com o domínio escapa.
--   3. `new.dominio_id = travado` é a saída que deixa VOLTAR pro endereço
--      travado — sem ela a central não conseguiria nem nascer no lugar certo.
--
-- Pra mudar de endereço de verdade: troque `DOMINIO_DOS_TUTORIAIS` em
-- lib/tridiflow-tutoriais.ts, troque as duas cópias daqui, rode este arquivo de
-- novo e REIMPRIMA o QR. O teste tutoriais-dominio-travado.test.ts compara as
-- cópias — divergirem é a trava valer só na metade dos caminhos.
--
-- Idempotente: pode rodar quantas vezes quiser. Se o seu editor reclamar de
-- sintaxe, rode os três statements abaixo UM POR VEZ (função, gatilho, update).

create or replace function tridiflow_tutoriais_dominio_travado() returns trigger
language plpgsql as $travado$
declare
  travado uuid;
begin
  if new.dominio_id is not distinct from old.dominio_id then
    return new;
  end if;
  if coalesce(new.pagina->'config'->>'template', '') <> 'central_tutoriais'
     and coalesce(old.pagina->'config'->>'template', '') <> 'central_tutoriais' then
    return new;
  end if;
  select id into travado from tridiflow_dominios where host = 'www.carimbostridii.com.br';
  if travado is not null and new.dominio_id = travado then
    return new;
  end if;
  raise exception 'dominio_travado: o site de tutoriais é fixo em www.carimbostridii.com.br — o QR impresso e os links já divulgados apontam pra lá';
end;
$travado$;

drop trigger if exists tutoriais_dominio_travado on tridiflow_bots;
create trigger tutoriais_dominio_travado
  before update of dominio_id on tridiflow_bots
  for each row execute function tridiflow_tutoriais_dominio_travado();

-- Põe no lugar toda central que esteja em outro endereço (no-op quando já está
-- certo, e quando o domínio ainda não foi cadastrado).
update tridiflow_bots b
   set dominio_id = d.id
  from tridiflow_dominios d
 where d.host = 'www.carimbostridii.com.br'
   and b.pagina->'config'->>'template' = 'central_tutoriais'
   and b.dominio_id is distinct from d.id;

-- Conferência: deve listar a central já no domínio travado.
-- select b.slug, d.host from tridiflow_bots b
--   left join tridiflow_dominios d on d.id = b.dominio_id
--  where b.pagina->'config'->>'template' = 'central_tutoriais';
